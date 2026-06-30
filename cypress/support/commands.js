// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************

Cypress.Commands.add('loginAsAdmin', (email, password) => {
  cy.session(`admin-${email}`, () => {
    cy.request({
      method: 'POST',
      url: '/api/auth/login',
      body: {
        email,
        password,
        role: 'admin'
      }
    }).then((response) => {
      expect(response.status).to.eq(200)
    })
  })
})

Cypress.Commands.add('loginAsWorker', (email, password) => {
  cy.session(`worker-${email}`, () => {
    cy.request({
      method: 'POST',
      url: '/api/auth/login',
      body: {
        email,
        password,
        role: 'worker'
      }
    }).then((response) => {
      expect(response.status).to.eq(200)
    })
  })
})

Cypress.Commands.add('loginAsStudent', () => {
  cy.session('student-google', () => {
    // 1. Get Google Client ID from env
    const clientId = Cypress.env('GOOGLE_CLIENT_ID')
    
    // 2. Run the Node.js task to open browser and wait for auth code
    cy.task('googleLogin', { clientId }, { timeout: 120000 }).then((code) => {
      // 3. Send the auth code to the backend to get the session cookie
      cy.request({
        method: 'POST',
        url: '/api/auth/google',
        body: { code }
      }).then((response) => {
        expect(response.status).to.eq(200)
      })
    })
  })
})

Cypress.Commands.add('logout', () => {
  cy.request({
    method: 'POST',
    url: '/api/auth/logout',
  })
})

// Wrapper around cy.request that won't fail the test automatically on non-2xx statuses
Cypress.Commands.add('api', (options) => {
  return cy.request({
    ...options,
    failOnStatusCode: false
  })
})
