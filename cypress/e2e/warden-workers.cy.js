describe('Warden Worker Management', () => {
  let createdWorkerId = null
  const testWorkerEmail = `test_worker_${Date.now()}@nitdelhi.ac.in`

  beforeEach(() => {
    // Must be Hostel Warden to manage workers
    cy.loginAsAdmin(Cypress.env('WARDEN_EMAIL'), Cypress.env('WARDEN_PASSWORD'))
  })

  it('should list workers for warden hostel', () => {
    cy.api({
      method: 'GET',
      url: '/api/admin/warden/workers'
    }).then((res) => {
      expect(res.status).to.eq(200)
      expect(res.body).to.be.an('array')
    })
  })

  it('should create a new worker', () => {
    cy.api({
      method: 'POST',
      url: '/api/admin/warden/workers',
      body: {
        name: 'Test Worker',
        email: testWorkerEmail,
        phone_no: '0987654321',
        gender: 'Male',
        department: 'Civil',
        sub_work_category: 'Plumbing'
      }
    }).then((res) => {
      expect(res.status).to.eq(201)
      expect(res.body.message).to.eq('Worker account created successfully.')
      expect(res.body.generatedPassword).to.be.a('string')
      createdWorkerId = res.body.worker.id
    })
  })

  it('should fail to create duplicate worker', () => {
    cy.api({
      method: 'POST',
      url: '/api/admin/warden/workers',
      body: {
        name: 'Duplicate Worker',
        email: testWorkerEmail,
        department: 'Plumbing'
      }
    }).then((res) => {
      expect(res.status).to.eq(400)
      expect(res.body.error).to.include('already exists')
    })
  })

  it('should fail to create worker with missing fields', () => {
    cy.api({
      method: 'POST',
      url: '/api/admin/warden/workers',
      body: {
        name: 'Incomplete Worker'
      }
    }).then((res) => {
      expect(res.status).to.eq(400)
    })
  })

  it('should update the created worker', () => {
    if (!createdWorkerId) {
      cy.log('Skipping update test, worker was not created')
      return
    }

    cy.api({
      method: 'PUT',
      url: `/api/admin/warden/workers/${createdWorkerId}`,
      body: {
        name: 'Updated Test Worker',
        email: testWorkerEmail,
        phone_no: '0987654321',
        gender: 'Male',
        department: 'Civil',
        sub_work_category: 'Plumbing'
      }
    }).then((res) => {
      expect(res.status).to.eq(200)
      expect(res.body.message).to.eq('Worker account updated successfully')
      expect(res.body.worker.name).to.eq('Updated Test Worker')
    })
  })

  it('should fetch worker performance stats', () => {
    cy.api({
      method: 'GET',
      url: '/api/admin/warden/performance'
    }).then((res) => {
      expect(res.status).to.eq(200)
      expect(res.body).to.have.property('stats')
      expect(res.body).to.have.property('workers')
      expect(res.body.workers).to.be.an('array')
    })
  })

  it('should fetch complaints for a specific worker', () => {
    if (!createdWorkerId) {
      cy.log('Skipping specific worker complaints test, worker was not created')
      return
    }

    cy.api({
      method: 'GET',
      url: `/api/admin/warden/workers/${createdWorkerId}/complaints`
    }).then((res) => {
      expect(res.status).to.eq(200)
      expect(res.body).to.have.property('history')
      expect(res.body).to.have.property('pagination')
    })
  })

  it('should delete the created worker', () => {
    if (!createdWorkerId) {
      cy.log('Skipping delete test, worker was not created')
      return
    }

    cy.api({
      method: 'DELETE',
      url: `/api/admin/warden/workers/${createdWorkerId}`
    }).then((res) => {
      expect(res.status).to.eq(200)
      expect(res.body.message).to.eq('Worker account deleted successfully.')
    })
  })
})
