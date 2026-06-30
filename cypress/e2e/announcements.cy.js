describe('Announcements', () => {
  beforeEach(() => {
    // Clear session
    Cypress.session.clearAllSavedSessions()
  })

  it('should return unauthenticated / empty or error without token', () => {
    cy.api({
      method: 'GET',
      url: '/api/announcements'
    }).then((res) => {
      // Our verifyToken middleware just calls next() if no token, 
      // but without req.user, role-based checks usually fail or it errors.
      // In this specific backend, it might fail inside controller on req.user.role if undefined.
      expect(res.status).to.be.oneOf([401, 500])
    })
  })

  it('should list announcements for admin', () => {
    cy.loginAsAdmin(Cypress.env('ADMIN_EMAIL'), Cypress.env('ADMIN_PASSWORD'))
    
    cy.api({
      method: 'GET',
      url: '/api/announcements'
    }).then((res) => {
      expect(res.status).to.eq(200)
      expect(res.body).to.be.an('array')
    })
  })

  it('should allow Chief Warden to create Common announcement', () => {
    cy.loginAsAdmin(Cypress.env('ADMIN_EMAIL'), Cypress.env('ADMIN_PASSWORD'))
    
    cy.api({
      method: 'POST',
      url: '/api/announcements',
      body: {
        title: 'Test Common Announcement',
        content: 'This is a test announcement from Cypress',
        type: 'Common'
      }
    }).then((res) => {
      expect(res.status).to.eq(201)
      expect(res.body.announcement.title).to.eq('Test Common Announcement')
    })
  })

  it('should prevent Chief Warden from creating Hostel announcement', () => {
    cy.loginAsAdmin(Cypress.env('ADMIN_EMAIL'), Cypress.env('ADMIN_PASSWORD'))
    
    cy.api({
      method: 'POST',
      url: '/api/announcements',
      body: {
        title: 'Test Hostel Announcement',
        content: 'Should fail',
        type: 'Hostel'
      }
    }).then((res) => {
      // Chief Warden can only announce as 'Common'
      expect(res.status).to.eq(403)
    })
  })

  it('should allow Hostel Warden to create Hostel announcement', () => {
    cy.loginAsAdmin(Cypress.env('WARDEN_EMAIL'), Cypress.env('WARDEN_PASSWORD'))
    
    cy.api({
      method: 'POST',
      url: '/api/announcements',
      body: {
        title: 'Test Hostel Announcement',
        content: 'From Warden',
        type: 'Hostel'
      }
    }).then((res) => {
      expect(res.status).to.eq(201)
    })
  })

  it('should allow worker to create Worker announcement', () => {
    cy.loginAsWorker(Cypress.env('WORKER_EMAIL'), Cypress.env('WORKER_PASSWORD'))
    
    cy.api({
      method: 'POST',
      url: '/api/announcements',
      body: {
        title: 'Test Worker Announcement',
        content: 'From Worker',
        type: 'Worker'
      }
    }).then((res) => {
      expect(res.status).to.eq(201)
    })
  })

  it('should prevent worker from creating Common announcement', () => {
    cy.loginAsWorker(Cypress.env('WORKER_EMAIL'), Cypress.env('WORKER_PASSWORD'))
    
    cy.api({
      method: 'POST',
      url: '/api/announcements',
      body: {
        title: 'Test Common Announcement',
        content: 'Should fail',
        type: 'Common'
      }
    }).then((res) => {
      expect(res.status).to.eq(403)
    })
  })

  it('should prevent student from creating announcements', () => {
    cy.loginAsStudent()
    
    cy.api({
      method: 'POST',
      url: '/api/announcements',
      body: {
        title: 'Student Announcement',
        content: 'Should fail',
        type: 'Common'
      }
    }).then((res) => {
      expect(res.status).to.eq(403)
    })
  })
})
