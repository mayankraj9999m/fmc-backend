# Cypress API Testing Framework — Walkthrough

I have successfully scaffolded the Cypress API testing framework for the FixMyCampus backend!

> [!WARNING]
> **Action Required**: My automated terminal is encountering a Windows sandbox permission error when trying to run `npm install`. Please run this command in your own terminal inside the `fix-my-campus-backend` directory to install the dependencies:
> ```bash
> npm install --save-dev cypress open
> ```

## What Was Implemented

1. **Configuration & Environment**:
   - `cypress.config.js`: Contains the `googleLogin` Node.js task to facilitate the OAuth flow via your default browser.
   - `cypress.env.json`: (Placeholder file created). **You must fill in your actual test credentials here** before running the tests.
   - `package.json`: Added `npm run test` (headless) and `npm run test:open` (interactive UI).

2. **Custom Commands (`cypress/support/commands.js`)**:
   - `cy.loginAsAdmin(email, password)`
   - `cy.loginAsWorker(email, password)`
   - `cy.loginAsStudent()` (Uses `cy.session()` + `cy.task('googleLogin')` to prompt for login once per suite run)
   - `cy.logout()`
   - `cy.api()` (A wrapper around `cy.request` that doesn't fail on 4xx/5xx status codes, making it easier to test error responses).

3. **Test Suites (`cypress/e2e/`)**:
   - **`auth.cy.js`**: Validates login flows, invalid credentials, role mismatch, and session retrieval.
   - **`admin-students.cy.js`**: Tests paginated listing, search/sort filters, manual creation, duplicate handling, updating, deletion, and CSV export.
   - **`chief-warden.cy.js`**: Validates Warden creation, duplicate email checks, password generation, analytics fetching, and RBAC enforcement against lower-level admins.
   - **`warden-workers.cy.js`**: Validates worker creation, performance stats, worker-specific complaints, and strict Warden-hostel scoping.
   - **`complaints.cy.js`**: Tests the entire lifecycle: student lodging, duplicate checks, student dashboards, escalation rule (3 days), worker dashboards, and worker resolution.
   - **`announcements.cy.js`**: Tests role-based announcement creation (Chief Warden vs. Hostel Warden vs. Worker) and ensures students cannot create them.

## The Google OAuth Flow

When you run `npm run test` or `npm run test:open`:
1. The `auth.cy.js` or `complaints.cy.js` test will hit the `cy.loginAsStudent()` command.
2. Cypress will automatically open a **new window in your system's default browser** (e.g., Chrome).
3. You will see the standard Google Sign-In screen. Log in with your `@nitdelhi.ac.in` email.
4. A temporary local server (`localhost:5173`) captures the callback.
5. The popup will say "Login successful!" and instruct you to close it.
6. Cypress captures the auth code, completes the backend handshake, and continues the automated tests seamlessly.

## Next Steps

1. Run `npm install --save-dev cypress open` in your terminal.
2. Update the `cypress.env.json` file with your actual test credentials.
3. Ensure your backend server is running (`npm run dev`).
4. Run `npm run test:open` to launch the Cypress UI and watch the tests execute!
