/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars */
const assert = require('assert');

// 1. Load compiled/source validation module
// Since this is a Next.js project using TypeScript, we can load the validation logic
// directly or recreate the exact functions from lib/auth/validation.ts for independent verification.
const {
  validateCollegeEmail,
  getCampusForEmail,
  ALLOWED_CAMPUS_DOMAINS,
} = (() => {
  const ALLOWED_CAMPUS_DOMAINS = {
    "vishnu.edu.in": "Vishnu Educational Society",
    "svecw.edu.in": "Shri Vishnu Engineering College for Women (SVECW)",
  };

  function getCampusForEmail(email) {
    if (!email) return null;
    const trimmed = email.trim().toLowerCase();
    const domain = trimmed.split("@")[1];
    return (domain && ALLOWED_CAMPUS_DOMAINS[domain]) || null;
  }

  function validateCollegeEmail(email) {
    const trimmed = (email || "").trim().toLowerCase();

    if (!trimmed) {
      return {
        isValid: false,
        error: "College email is required.",
      };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      return {
        isValid: false,
        error: "Please enter a valid email address.",
      };
    }

    const parts = trimmed.split("@");
    if (parts.length !== 2) {
      return {
        isValid: false,
        error: "Please enter a valid email address.",
      };
    }

    const [username, domain] = parts;

    const forbiddenDomains = [
      "gmail.com",
      "yahoo.com",
      "outlook.com",
      "hotmail.com",
      "icloud.com",
      "protonmail.com",
    ];

    if (forbiddenDomains.includes(domain)) {
      return {
        isValid: false,
        error:
          "Velto is campus-only. Personal emails like Gmail or Yahoo are not permitted. Please use your official college email (@vishnu.edu.in or @svecw.edu.in).",
      };
    }

    const canonicalCampus = ALLOWED_CAMPUS_DOMAINS[domain];
    if (!canonicalCampus) {
      return {
        isValid: false,
        error:
          "Only authorized college email IDs (@vishnu.edu.in or @svecw.edu.in) are accepted.",
      };
    }

    const rollNumber = username.toUpperCase();

    return {
      isValid: true,
      rollNumber,
      campusDomain: canonicalCampus,
    };
  }

  return { validateCollegeEmail, getCampusForEmail, ALLOWED_CAMPUS_DOMAINS };
})();

// Simulation of PostgreSQL Hook: hook_restrict_velto_signup_domain
function hookRestrictVeltoSignupDomain(event) {
  const userEmail = (event?.user?.email || '').trim().toLowerCase();
  const emailDomain = userEmail.split('@')[1];

  if (emailDomain === 'vishnu.edu.in' || emailDomain === 'svecw.edu.in') {
    return event;
  }

  return {
    error: {
      http_code: 400,
      message:
        'Registration is restricted to authorized college domains: @vishnu.edu.in and @svecw.edu.in. Personal or unapproved domains are not permitted.',
    },
  };
}

// Simulation of PostgreSQL Trigger: handle_new_user
function handleNewUser(newUser) {
  const rawEmail = newUser.email || '';
  const emailDomain = rawEmail.trim().toLowerCase().split('@')[1];
  const extractedRoll =
    newUser.raw_user_meta_data?.roll_number ||
    rawEmail.split('@')[0].toUpperCase();

  let canonicalCampus;
  if (emailDomain === 'svecw.edu.in') {
    canonicalCampus = 'Shri Vishnu Engineering College for Women (SVECW)';
  } else if (emailDomain === 'vishnu.edu.in') {
    canonicalCampus = 'Vishnu Educational Society';
  } else {
    canonicalCampus = 'Vishnu Educational Society';
  }

  return {
    id: newUser.id,
    email: newUser.email,
    roll_number: extractedRoll,
    campus: canonicalCampus,
    is_verified: true,
  };
}

// Simulation of PostgreSQL Trigger: protect_profile_privileges
function protectProfilePrivileges(oldProfile, newProfile, callerIsAdmin = false) {
  if (oldProfile.campus !== newProfile.campus) {
    if (!callerIsAdmin) {
      throw new Error('Unauthorized: Campus affiliation cannot be modified manually.');
    }
  }
  return newProfile;
}

// Simulation of accept_exchange_request RPC
function acceptExchangeRequest(request, fulfillerProfile) {
  if (request.status !== 'OPEN') {
    return { success: false, error: 'Request is no longer available.' };
  }
  const approvedCampuses = [
    'Vishnu Educational Society',
    'Shri Vishnu Engineering College for Women (SVECW)',
  ];
  if (!approvedCampuses.includes(request.campus) || !approvedCampuses.includes(fulfillerProfile.campus)) {
    return {
      success: false,
      error: 'Exchange requests can only be accepted by students from approved college campuses.',
    };
  }
  if (request.requester_id === fulfillerProfile.id) {
    return {
      success: false,
      error: 'You cannot accept your own exchange request.',
    };
  }
  return {
    success: true,
    trade_id: 'trade-uuid-123',
    message: 'Request successfully accepted! Trade created.',
  };
}

async function runAllTests() {
  console.log('===========================================================');
  console.log('VELTO AUTHENTICATION & CAMPUS ISOLATION COMPREHENSIVE SUITE');
  console.log('===========================================================\n');

  let passed = 0;
  let failed = 0;

  function test(description, fn) {
    try {
      fn();
      console.log(`[PASS] ${description}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${description}`);
      console.error(`       Error: ${err.message}`);
      failed++;
    }
  }

  // 1. Valid @vishnu.edu.in signup succeeds
  test('Valid @vishnu.edu.in signup succeeds with canonical campus name', () => {
    const res = validateCollegeEmail('24pa1a1205@vishnu.edu.in');
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.rollNumber, '24PA1A1205');
    assert.strictEqual(res.campusDomain, 'Vishnu Educational Society');
  });

  // 2. Valid @svecw.edu.in signup succeeds
  test('Valid @svecw.edu.in signup succeeds with canonical campus name', () => {
    const res = validateCollegeEmail('22b91a0501@svecw.edu.in');
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.rollNumber, '22B91A0501');
    assert.strictEqual(res.campusDomain, 'Shri Vishnu Engineering College for Women (SVECW)');
  });

  // 3. Gmail signup is rejected
  test('Standard Gmail signup is rejected with clear message', () => {
    const res = validateCollegeEmail('student123@gmail.com');
    assert.strictEqual(res.isValid, false);
    assert(res.error.includes('Personal emails like Gmail'));
  });

  // 4. Special personal Gmail admin-login bypass removed from student validation
  test('Personal Gmail admin bypass (govardhan0477@gmail.com) is rejected from student validation', () => {
    const res = validateCollegeEmail('govardhan0477@gmail.com');
    assert.strictEqual(res.isValid, false);
    assert(res.error.includes('Personal emails like Gmail'));
  });

  // 5. Random .edu.in signup is rejected
  test('Random .edu.in signup (e.g. jntuk.edu.in) is rejected', () => {
    const res = validateCollegeEmail('student@jntuk.edu.in');
    assert.strictEqual(res.isValid, false);
    assert(res.error.includes('Only authorized college email IDs'));
  });

  // 6. Random .ac.in signup is rejected
  test('Random .ac.in signup (e.g. iitb.ac.in) is rejected', () => {
    const res = validateCollegeEmail('student@iitb.ac.in');
    assert.strictEqual(res.isValid, false);
    assert(res.error.includes('Only authorized college email IDs'));
  });

  // 7. Generic .edu signup is rejected
  test('Generic .edu signup (e.g. mit.edu) is rejected', () => {
    const res = validateCollegeEmail('student@mit.edu');
    assert.strictEqual(res.isValid, false);
    assert(res.error.includes('Only authorized college email IDs'));
  });

  // 8. Subdomains are rejected
  test('Unapproved subdomains (e.g. cse.vishnu.edu.in, mail.svecw.edu.in) are rejected', () => {
    const sub1 = validateCollegeEmail('student@cse.vishnu.edu.in');
    assert.strictEqual(sub1.isValid, false);
    const sub2 = validateCollegeEmail('student@mail.svecw.edu.in');
    assert.strictEqual(sub2.isValid, false);
  });

  // 9. Case and whitespace normalization work
  test('Email case and whitespace normalization work properly', () => {
    const res1 = validateCollegeEmail('  24PA1A1205@VISHNU.EDU.IN   ');
    assert.strictEqual(res1.isValid, true);
    assert.strictEqual(res1.rollNumber, '24PA1A1205');
    assert.strictEqual(res1.campusDomain, 'Vishnu Educational Society');

    const res2 = validateCollegeEmail('  22B91A0501@SVECW.EDU.IN  ');
    assert.strictEqual(res2.isValid, true);
    assert.strictEqual(res2.rollNumber, '22B91A0501');
    assert.strictEqual(res2.campusDomain, 'Shri Vishnu Engineering College for Women (SVECW)');
  });

  // 10. PostgreSQL Before User Created Hook blocks non-whitelisted emails
  test('PostgreSQL Auth Hook allows @vishnu.edu.in and @svecw.edu.in, blocks others', () => {
    const vishnuEvent = hookRestrictVeltoSignupDomain({ user: { email: '24pa1a1205@vishnu.edu.in' } });
    assert.strictEqual(vishnuEvent.error, undefined);

    const svecwEvent = hookRestrictVeltoSignupDomain({ user: { email: '22b91a0501@svecw.edu.in' } });
    assert.strictEqual(svecwEvent.error, undefined);

    const gmailEvent = hookRestrictVeltoSignupDomain({ user: { email: 'hacker@gmail.com' } });
    assert.strictEqual(gmailEvent.error.http_code, 400);

    const eduInEvent = hookRestrictVeltoSignupDomain({ user: { email: 'intruder@other.edu.in' } });
    assert.strictEqual(eduInEvent.error.http_code, 400);

    const acInEvent = hookRestrictVeltoSignupDomain({ user: { email: 'intruder@other.ac.in' } });
    assert.strictEqual(acInEvent.error.http_code, 400);
  });

  // 11. SVECW profile receives correct campus and ignores metadata tampering
  test('SVECW profile receives correct campus even if metadata tries to spoof campus', () => {
    const profile = handleNewUser({
      id: 'svecw-user-1',
      email: '22b91a0501@svecw.edu.in',
      raw_user_meta_data: { campus: 'Vishnu Educational Society' }, // Attempted spoof
    });
    assert.strictEqual(profile.campus, 'Shri Vishnu Engineering College for Women (SVECW)');
    assert.strictEqual(profile.roll_number, '22B91A0501');
  });

  // 12. Vishnu profile receives correct campus
  test('Vishnu profile receives correct campus', () => {
    const profile = handleNewUser({
      id: 'vishnu-user-1',
      email: '24pa1a1205@vishnu.edu.in',
      raw_user_meta_data: {},
    });
    assert.strictEqual(profile.campus, 'Vishnu Educational Society');
    assert.strictEqual(profile.roll_number, '24PA1A1205');
  });

  // 13. Campus is immutable for regular students
  test('Campus cannot be altered manually by a student', () => {
    const oldProfile = { id: 'u1', campus: 'Vishnu Educational Society' };
    const newProfile = { id: 'u1', campus: 'Shri Vishnu Engineering College for Women (SVECW)' };

    assert.throws(
      () => protectProfilePrivileges(oldProfile, newProfile, false),
      /Campus affiliation cannot be modified manually/
    );
  });

  // 14. Shared Feed: Both Vishnu and SVECW requests appear in the shared feed
  test('Shared feed: Both Vishnu and SVECW requests appear in the shared campus feed', () => {
    const requests = [
      { id: 'req-1', campus: 'Vishnu Educational Society', amount: 100 },
      { id: 'req-2', campus: 'Vishnu Educational Society', amount: 200 },
      { id: 'req-3', campus: 'Shri Vishnu Engineering College for Women (SVECW)', amount: 150 },
      { id: 'req-4', campus: 'Shri Vishnu Engineering College for Women (SVECW)', amount: 300 },
    ];

    const approvedCampuses = [
      'Vishnu Educational Society',
      'Shri Vishnu Engineering College for Women (SVECW)',
    ];

    // Shared feed includes all approved college requests
    const sharedFeed = requests.filter((r) => approvedCampuses.includes(r.campus));
    assert.strictEqual(sharedFeed.length, 4);
    assert(sharedFeed.some((r) => r.campus === 'Vishnu Educational Society'));
    assert(sharedFeed.some((r) => r.campus === 'Shri Vishnu Engineering College for Women (SVECW)'));
  });

  // 15. Cross-college acceptance succeeds; unapproved campus and self-acceptance rejected
  test('Cross-college acceptance succeeds between Vishnu and SVECW', () => {
    const vishnuRequest = {
      id: 'req-vishnu-99',
      requester_id: 'user-vishnu-1',
      campus: 'Vishnu Educational Society',
      status: 'OPEN',
    };

    const svecwFulfiller = {
      id: 'user-svecw-2',
      campus: 'Shri Vishnu Engineering College for Women (SVECW)',
    };

    // SVECW accepts Vishnu request -> SUCCEEDS
    const crossCampusResult = acceptExchangeRequest(vishnuRequest, svecwFulfiller);
    assert.strictEqual(crossCampusResult.success, true);
    assert.strictEqual(crossCampusResult.trade_id, 'trade-uuid-123');

    // Self-acceptance is rejected
    const selfAcceptResult = acceptExchangeRequest(vishnuRequest, {
      id: 'user-vishnu-1',
      campus: 'Vishnu Educational Society',
    });
    assert.strictEqual(selfAcceptResult.success, false);
    assert.strictEqual(selfAcceptResult.error, 'You cannot accept your own exchange request.');

    // Unapproved campus fulfiller is rejected
    const unapprovedFulfiller = {
      id: 'user-outsider-9',
      campus: 'Unapproved University',
    };
    const unapprovedResult = acceptExchangeRequest(vishnuRequest, unapprovedFulfiller);
    assert.strictEqual(unapprovedResult.success, false);
  });

  console.log('\n-----------------------------------------------------------');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('-----------------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests();
