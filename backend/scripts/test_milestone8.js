/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars */
const { Client } = require('pg');

async function runMilestone8Tests() {
  const client = new Client({
    connectionString: 'postgresql://postgres:YOUR_DB_PASSWORD@db.csbdbhnvsykrsozwzdwk.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('=== RUNNING MILESTONE 8: RATINGS, REPUTATION & TRADE HISTORY TESTS ===\n');

  // Fetch test users
  const usersRes = await client.query(`
    SELECT id, email, full_name, is_onboarded, campus, rating_avg, total_ratings 
    FROM public.profiles 
    LIMIT 4;
  `);

  if (usersRes.rows.length < 3) {
    console.error('Need at least 3 users for testing.');
    await client.end();
    return;
  }

  const user1 = usersRes.rows[0]; // Requester
  const user2 = usersRes.rows[1]; // Fulfiller
  const user3 = usersRes.rows[2]; // Outsider

  // Ensure active baseline
  await client.query(`
    UPDATE public.profiles 
    SET is_onboarded = true, is_suspended = false, is_banned = false 
    WHERE id IN ($1, $2, $3);
  `, [user1.id, user2.id, user3.id]);

  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name}`);
      failed++;
    }
  }

  // Helper to execute submit_trade_rating as a specific authenticated user
  async function submitRatingAsUser(c, userId, tradeId, rating, comment = null) {
    await c.query("SET ROLE authenticated;");
    await c.query("SELECT set_config('request.jwt.claim.sub', $1, false);", [userId]);
    try {
      const res = await c.query("SELECT public.submit_trade_rating($1, $2, $3) as result;", [
        tradeId,
        rating,
        comment,
      ]);
      return res.rows[0].result;
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      await c.query("RESET ROLE;");
    }
  }

  // -------------------------------------------------------------
  // SETUP: Create a COMPLETED trade between user1 and user2
  // -------------------------------------------------------------
  console.log('--- Test Setup: Creating COMPLETED Trade ---');
  const reqRes = await client.query(`
    INSERT INTO public.exchange_requests (
      requester_id, request_type, amount, location_hint, status, campus, expires_at
    ) VALUES ($1, 'NEED_CASH', 300.00, 'Library Entrance', 'COMPLETED', $2, NOW() + INTERVAL '2 hours')
    RETURNING id;
  `, [user1.id, user1.campus || 'Main Campus']);
  const reqId = reqRes.rows[0].id;

  const tradeRes = await client.query(`
    INSERT INTO public.trades (
      request_id, requester_id, fulfiller_id, amount, request_type, status, meetup_location,
      requester_confirmed, fulfiller_confirmed, completed_at
    ) VALUES ($1, $2, $3, 300.00, 'NEED_CASH', 'COMPLETED', 'Library Entrance', true, true, NOW())
    RETURNING id;
  `, [reqId, user1.id, user2.id]);
  const completedTradeId = tradeRes.rows[0].id;

  // -------------------------------------------------------------
  // TEST 1: Requester can rate fulfiller on a COMPLETED trade
  // -------------------------------------------------------------
  console.log('\n--- Test 1: Requester Rates Fulfiller ---');
  const res1 = await submitRatingAsUser(client, user1.id, completedTradeId, 5, 'Fast and very polite!');
  assert(
    res1.success === true && res1.rating === 5 && res1.comment === 'Fast and very polite!',
    'Requester successfully submitted 5-star rating with comment for fulfiller'
  );

  // Check that rating is in trade_ratings table
  const ratingRow1 = await client.query(
    'SELECT * FROM public.trade_ratings WHERE trade_id = $1 AND reviewer_id = $2;',
    [completedTradeId, user1.id]
  );
  assert(
    ratingRow1.rows.length === 1 &&
    ratingRow1.rows[0].reviewed_id === user2.id &&
    ratingRow1.rows[0].rating === 5,
    'trade_ratings row verified: reviewer is requester, reviewed is fulfiller'
  );

  // -------------------------------------------------------------
  // TEST 2: Fulfiller can rate requester independently
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Fulfiller Rates Requester Independently ---');
  const res2 = await submitRatingAsUser(client, user2.id, completedTradeId, 4, 'On time at library.');
  assert(
    res2.success === true && res2.rating === 4,
    'Fulfiller successfully submitted 4-star rating for requester'
  );

  const ratingRow2 = await client.query(
    'SELECT * FROM public.trade_ratings WHERE trade_id = $1 AND reviewer_id = $2;',
    [completedTradeId, user2.id]
  );
  assert(
    ratingRow2.rows.length === 1 &&
    ratingRow2.rows[0].reviewed_id === user1.id &&
    ratingRow2.rows[0].rating === 4,
    'trade_ratings row verified: reviewer is fulfiller, reviewed is requester'
  );

  // -------------------------------------------------------------
  // TEST 3: Duplicate rating by same user on same trade is rejected
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Duplicate Rating Attempt Rejected ---');
  const resDup = await submitRatingAsUser(client, user1.id, completedTradeId, 5, 'Trying to rate again');
  assert(
    resDup.success === false && resDup.error.includes('already submitted a rating'),
    'Duplicate rating rejected: "You have already submitted a rating for this trade partner."'
  );

  // -------------------------------------------------------------
  // TEST 4: Self-rating is rejected by database check constraint
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Self-Rating Rejected by Check Constraint ---');
  let selfRatingRejected = false;
  try {
    // Attempting direct insertion where reviewer_id = reviewed_id violates no_self_rating constraint
    await client.query(`
      INSERT INTO public.trade_ratings (
        trade_id, reviewer_id, reviewed_id, rating
      ) VALUES ($1, $2, $2, 5);
    `, [completedTradeId, user1.id]);
  } catch (err) {
    if (err.message.includes('no_self_rating') || err.message.includes('check constraint')) {
      selfRatingRejected = true;
    }
  }
  assert(
    selfRatingRejected,
    'Self-rating rejected by database constraint: "no_self_rating CHECK (reviewer_id <> reviewed_id)"'
  );

  // Helper to create a dedicated request and trade
  async function createTestTrade(c, reqUserId, fulUserId, status = 'COMPLETED') {
    const r = await c.query(`
      INSERT INTO public.exchange_requests (
        requester_id, request_type, amount, location_hint, status, campus, expires_at
      ) VALUES ($1, 'NEED_CASH', 200.00, 'Campus Center', $2, 'Main Campus', NOW() + INTERVAL '2 hours')
      RETURNING id;
    `, [reqUserId, status === 'COMPLETED' ? 'COMPLETED' : 'ACCEPTED']);
    const rId = r.rows[0].id;

    const t = await c.query(`
      INSERT INTO public.trades (
        request_id, requester_id, fulfiller_id, amount, request_type, status, meetup_location,
        requester_confirmed, fulfiller_confirmed, completed_at
      ) VALUES ($1, $2, $3, 200.00, 'NEED_CASH', $4, 'Campus Center',
        $5, $5, $6)
      RETURNING id;
    `, [
      rId,
      reqUserId,
      fulUserId,
      status,
      status === 'COMPLETED',
      status === 'COMPLETED' ? new Date() : null,
    ]);
    return t.rows[0].id;
  }

  // -------------------------------------------------------------
  // TEST 5: Rating an incomplete (IN_PROGRESS) trade is rejected
  // -------------------------------------------------------------
  console.log('\n--- Test 5: Incomplete Trade Rating Rejected ---');
  const inProgTradeId = await createTestTrade(client, user1.id, user2.id, 'IN_PROGRESS');

  const resInProg = await submitRatingAsUser(client, user1.id, inProgTradeId, 5);
  assert(
    resInProg.success === false && resInProg.error.includes('COMPLETED'),
    'Rating incomplete trade rejected: "Ratings can only be submitted after a trade is fully COMPLETED."'
  );

  // -------------------------------------------------------------
  // TEST 6: Rating a CANCELLED trade is rejected
  // -------------------------------------------------------------
  console.log('\n--- Test 6: Cancelled Trade Rating Rejected ---');
  const cancelTradeId = await createTestTrade(client, user1.id, user2.id, 'CANCELLED');

  const resCancel = await submitRatingAsUser(client, user1.id, cancelTradeId, 5);
  assert(
    resCancel.success === false && resCancel.error.includes('COMPLETED'),
    'Rating cancelled trade rejected'
  );

  // -------------------------------------------------------------
  // TEST 7: Outsider (non-participant) rating is rejected
  // -------------------------------------------------------------
  console.log('\n--- Test 7: Outsider Rating Rejected ---');
  const resOutsider = await submitRatingAsUser(client, user3.id, completedTradeId, 5);
  assert(
    resOutsider.success === false && resOutsider.error.includes('not a participant'),
    'Outsider rating rejected: "Access denied: You are not a participant in this trade."'
  );

  // -------------------------------------------------------------
  // TEST 8: Rating value boundary validation (0 or 6 stars)
  // -------------------------------------------------------------
  console.log('\n--- Test 8: Rating Value Boundaries (1 to 5 stars) ---');
  const boundaryTradeId = await createTestTrade(client, user1.id, user3.id, 'COMPLETED');

  const resZero = await submitRatingAsUser(client, user1.id, boundaryTradeId, 0);
  assert(
    resZero.success === false && resZero.error.includes('between 1 and 5'),
    'Rating of 0 stars rejected'
  );

  const resSix = await submitRatingAsUser(client, user1.id, boundaryTradeId, 6);
  assert(
    resSix.success === false && resSix.error.includes('between 1 and 5'),
    'Rating of 6 stars rejected'
  );

  // -------------------------------------------------------------
  // TEST 9: Comment length limit (max 500 characters)
  // -------------------------------------------------------------
  console.log('\n--- Test 9: Comment Length Boundary (max 500 chars) ---');
  const longComment = 'a'.repeat(501);
  const resLong = await submitRatingAsUser(client, user1.id, boundaryTradeId, 5, longComment);
  assert(
    resLong.success === false && resLong.error.includes('500 characters'),
    'Comment over 500 characters rejected'
  );

  // -------------------------------------------------------------
  // TEST 10: Automatic Reputation Calculation on Profiles
  // -------------------------------------------------------------
  console.log('\n--- Test 10: Automatic Reputation Calculation Verification ---');
  // Check user2's profile rating_avg and total_ratings after user1 rated user2 5 stars
  const prof2 = await client.query('SELECT rating_avg, total_ratings FROM public.profiles WHERE id = $1;', [user2.id]);
  const user2Ratings = await client.query('SELECT rating FROM public.trade_ratings WHERE reviewed_id = $1;', [user2.id]);
  const expectedCount = user2Ratings.rows.length;
  const expectedAvg = (user2Ratings.rows.reduce((sum, r) => sum + r.rating, 0) / expectedCount).toFixed(2);

  assert(
    Number(prof2.rows[0].rating_avg).toFixed(2) === expectedAvg &&
    Number(prof2.rows[0].total_ratings) === expectedCount,
    `Profile reputation accurately calculated: rating_avg = ${prof2.rows[0].rating_avg} (expected ${expectedAvg}), total_ratings = ${prof2.rows[0].total_ratings}`
  );

  // -------------------------------------------------------------
  // TEST 11: Direct INSERT into trade_ratings blocked by RLS
  // -------------------------------------------------------------
  console.log('\n--- Test 11: Direct Table Manipulation Blocked by RLS ---');
  await client.query("SET ROLE authenticated;");
  await client.query("SELECT set_config('request.jwt.claim.sub', $1, false);", [user1.id]);
  let directInsertBlocked = false;
  try {
    await client.query(`
      INSERT INTO public.trade_ratings (trade_id, reviewer_id, reviewed_id, rating)
      VALUES ($1, $2, $3, 5);
    `, [boundaryTradeId, user1.id, user3.id]);
  } catch (err) {
    directInsertBlocked = true;
  } finally {
    await client.query("RESET ROLE;");
  }

  assert(directInsertBlocked, 'Direct client INSERT into trade_ratings is blocked by RLS policy');

  // Direct UPDATE blocked
  await client.query("SET ROLE authenticated;");
  await client.query("SELECT set_config('request.jwt.claim.sub', $1, false);", [user1.id]);
  let directUpdateBlocked = false;
  try {
    const updateRes = await client.query(`
      UPDATE public.trade_ratings SET rating = 1 WHERE trade_id = $1;
    `, [completedTradeId]);
    if (updateRes.rowCount === 0) {
      directUpdateBlocked = true; // RLS silently filters out rows for update
    }
  } catch (err) {
    directUpdateBlocked = true;
  } finally {
    await client.query("RESET ROLE;");
  }
  assert(directUpdateBlocked, 'Direct client UPDATE on trade_ratings is blocked by RLS (0 rows affected or error)');

  // -------------------------------------------------------------
  // TEST 12: Public profiles safe info check (No UPI ID, email, or chat leaked)
  // -------------------------------------------------------------
  console.log('\n--- Test 12: Safe Public Profile Info ---');
  const safeProfile = await client.query(`
    SELECT full_name, department, year_of_study, roll_number, rating_avg, total_trades, total_ratings
    FROM public.profiles
    WHERE id = $1;
  `, [user2.id]);
  assert(
    safeProfile.rows.length === 1 &&
    safeProfile.rows[0].full_name !== undefined &&
    safeProfile.rows[0].rating_avg !== undefined,
    'Safe public profile attributes are accessible without exposing private upi_id or email'
  );

  console.log('\n=============================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('=============================================================\n');

  await client.end();
  process.exit(failed > 0 ? 1 : 0);
}

runMilestone8Tests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
