describe('Auth & Session Management', () => {
  beforeEach(() => {
    // We don't want to preserve session across tests unless explicitly requested
    Cypress.session.clearAllSavedSessions()
  })

  it('should login as admin with valid credentials', () => {
    cy.api({
      method: 'POST',
      url: '/api/auth/login',
      body: {
        email: Cypress.env('ADMIN_EMAIL'),
        password: Cypress.env('ADMIN_PASSWORD'),
        role: 'admin'
      }
    }).then((res) => {
      expect(res.status).to.eq(200)
      expect(res.body.message).to.eq('Login successful')
      expect(res.body.role).to.eq('admin')
      expect(res.body.user).to.have.property('id')
    })
  })

  it('should login as worker with valid credentials', () => {
    cy.api({
      method: 'POST',
      url: '/api/auth/login',
      body: {
        email: Cypress.env('WORKER_EMAIL'),
        password: Cypress.env('WORKER_PASSWORD'),
        role: 'worker'
      }
    }).then((res) => {
      expect(res.status).to.eq(200)
      expect(res.body.message).to.eq('Login successful')
      expect(res.body.role).to.eq('worker')
    })
  })

  it('should fail login with missing fields', () => {
    cy.api({
      method: 'POST',
      url: '/api/auth/login',
      body: {
        email: Cypress.env('ADMIN_EMAIL')
        // missing password and role
      }
    }).then((res) => {
      expect(res.status).to.eq(400)
      expect(res.body.error).to.include('required')
    })
  })

  it('should fail login with wrong password', () => {
    cy.api({
      method: 'POST',
      url: '/api/auth/login',
      body: {
        email: Cypress.env('ADMIN_EMAIL'),
        password: 'wrongpassword',
        role: 'admin'
      }
    }).then((res) => {
      expect(res.status).to.eq(401)
      expect(res.body.error).to.include('Invalid password')
    })
  })

  it('should get profile data when authenticated', () => {
    cy.loginAsAdmin(Cypress.env('ADMIN_EMAIL'), Cypress.env('ADMIN_PASSWORD'))
    
    cy.api({
      method: 'GET',
      url: '/api/auth/profile'
    }).then((res) => {
      expect(res.status).to.eq(200)
      expect(res.body.user.email).to.eq(Cypress.env('ADMIN_EMAIL'))
      expect(res.body.role).to.eq('admin')
    })
  })

  it('should return 401 for profile when not authenticated', () => {
    cy.api({
      method: 'GET',
      url: '/api/auth/profile'
    }).then((res) => {
      expect(res.status).to.eq(401)
    })
  })

  it('should logout successfully', () => {
    cy.loginAsAdmin(Cypress.env('ADMIN_EMAIL'), Cypress.env('ADMIN_PASSWORD'))
    
    cy.api({
      method: 'POST',
      url: '/api/auth/logout'
    }).then((res) => {
      expect(res.status).to.eq(200)
      expect(res.body.message).to.eq('Logged out successfully')
    })

    // Profile should now fail
    cy.api({
      method: 'GET',
      url: '/api/auth/profile'
    }).then((res) => {
      expect(res.status).to.eq(401)
    })
  })

  it('should allow student login via Google OAuth flow', () => {
    cy.loginAsStudent()
    
    cy.api({
      method: 'GET',
      url: '/api/auth/profile'
    }).then((res) => {
      expect(res.status).to.eq(200)
      expect(res.body.role).to.eq('student')
      expect(res.body.user.email).to.include('@nitdelhi.ac.in')
    })
  })
})
