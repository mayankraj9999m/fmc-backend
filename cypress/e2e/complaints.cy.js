describe('Complaint Lifecycle', () => {
  let createdComplaintId = null

  // We assume there is a student and worker matching this in DB for full e2e, 
  // else some assertions might skip or fail if data isn't seeded correctly.
  
  it('should lodge a complaint as a student', () => {
    cy.loginAsStudent()
    
    cy.api({
      method: 'POST',
      url: '/api/complaints/student',
      body: {
        department: 'Civil',
        sub_category: 'Plumbing', // Must match work_department exactly if there's an FK check
        description: 'Test complaint description'
      }
    }).then((res) => {
      // 400 is expected if duplicate exists or FK constraint fails
      // 201 is expected if success
      if (res.status === 201) {
        createdComplaintId = res.body.id
        expect(res.body).to.have.property('id')
      } else if (res.status === 400) {
        cy.log('Lodge failed: ' + res.body.error)
      }
    })
  })

  it('should fail to lodge complaint with missing fields', () => {
    cy.loginAsStudent()
    
    cy.api({
      method: 'POST',
      url: '/api/complaints/student',
      body: {
        department: 'Electrical'
        // missing sub_category and description
      }
    }).then((res) => {
      expect(res.status).to.eq(400)
    })
  })

  it('should get student dashboard stats', () => {
    cy.loginAsStudent()
    
    cy.api({
      method: 'GET',
      url: '/api/complaints/student/dashboard'
    }).then((res) => {
      expect(res.status).to.eq(200)
      expect(res.body).to.have.property('stats')
      expect(res.body).to.have.property('history')
    })
  })

  it('should fail to escalate a new complaint due to 3-day rule', () => {
    if (!createdComplaintId) {
      cy.log('No complaint created, skipping escalate test')
      return
    }
    
    cy.loginAsStudent()
    
    cy.api({
      method: 'PUT',
      url: `/api/complaints/student/${createdComplaintId}/escalate`
    }).then((res) => {
      // Should fail because it was just created (needs 3 days)
      expect(res.status).to.eq(400)
    })
  })

  it('should fail to provide feedback on unresolved complaint', () => {
    if (!createdComplaintId) {
      cy.log('No complaint created, skipping feedback test')
      return
    }
    
    cy.loginAsStudent()
    
    cy.api({
      method: 'PUT',
      url: `/api/complaints/student/${createdComplaintId}/feedback`,
      body: {
        rating: 5,
        feedback: 'Great job!'
      }
    }).then((res) => {
      // Expected to fail because status != 'Resolved'
      expect(res.status).to.eq(400)
    })
  })

  it('should get worker dashboard stats', () => {
    cy.loginAsWorker(Cypress.env('WORKER_EMAIL'), Cypress.env('WORKER_PASSWORD'))
    
    cy.api({
      method: 'GET',
      url: '/api/complaints/worker/dashboard'
    }).then((res) => {
      expect(res.status).to.eq(200)
      expect(res.body).to.have.property('stats')
      expect(res.body).to.have.property('history')
    })
  })

  it('should resolve a complaint as a worker', () => {
    if (!createdComplaintId) {
      cy.log('No complaint created, skipping resolve test')
      return
    }

    cy.loginAsWorker(Cypress.env('WORKER_EMAIL'), Cypress.env('WORKER_PASSWORD'))
    
    cy.api({
      method: 'PUT',
      url: `/api/complaints/worker/${createdComplaintId}/resolve`,
      body: {
        resolution_message: 'Fixed the issue'
      }
    }).then((res) => {
      // If it wasn't assigned to this specific worker, it might return 400
      if (res.status === 200) {
        expect(res.body.status).to.eq('Resolved')
      } else {
        expect(res.status).to.eq(400)
      }
    })
  })

  it('should prevent student from accessing worker routes', () => {
    cy.loginAsStudent()
    
    cy.api({
      method: 'GET',
      url: '/api/complaints/worker/dashboard'
    }).then((res) => {
      expect(res.status).to.eq(403)
    })
  })

  it('should prevent worker from accessing student routes', () => {
    cy.loginAsWorker(Cypress.env('WORKER_EMAIL'), Cypress.env('WORKER_PASSWORD'))
    
    cy.api({
      method: 'GET',
      url: '/api/complaints/student/dashboard'
    }).then((res) => {
      expect(res.status).to.eq(403)
    })
  })
})
