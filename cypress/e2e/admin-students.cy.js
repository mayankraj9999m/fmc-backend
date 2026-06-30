describe('Admin Student Management', () => {
  let createdStudentId = null
  const testStudentRoll = 'TEST_' + Date.now()
  const testStudentEmail = `test_${Date.now()}@nitdelhi.ac.in`

  beforeEach(() => {
    // Needs to be Chief Warden for unrestricted access, or Hostel Warden for scoped access
    cy.loginAsAdmin(Cypress.env('ADMIN_EMAIL'), Cypress.env('ADMIN_PASSWORD'))
  })

  it('should list students with pagination', () => {
    cy.api({
      method: 'GET',
      url: '/api/admin/students?page=1&limit=5'
    }).then((res) => {
      expect(res.status).to.eq(200)
      expect(res.body).to.have.property('students')
      expect(res.body).to.have.property('pagination')
      expect(res.body.students).to.be.an('array')
      expect(res.body.pagination.limit).to.eq(5)
    })
  })

  it('should search for students', () => {
    cy.api({
      method: 'GET',
      url: '/api/admin/students?search=test'
    }).then((res) => {
      expect(res.status).to.eq(200)
      expect(res.body.students).to.be.an('array')
    })
  })

  it('should sort students', () => {
    cy.api({
      method: 'GET',
      url: '/api/admin/students?sortBy=name&sortOrder=DESC'
    }).then((res) => {
      expect(res.status).to.eq(200)
      expect(res.body.students).to.be.an('array')
    })
  })

  it('should create a new student manually', () => {
    cy.api({
      method: 'POST',
      url: '/api/admin/students/add',
      body: {
        roll_no: testStudentRoll,
        name: 'Test Student',
        email: testStudentEmail,
        // Optional fields
        room_no: '101',
        floor_no: '1'
      }
    }).then((res) => {
      expect(res.status).to.eq(201)
      expect(res.body.message).to.eq('Student added successfully.')
      
      // Fetch the student to get the ID for deletion
      cy.api({
        method: 'GET',
        url: `/api/admin/students?search=${testStudentRoll}`
      }).then((searchRes) => {
        if (searchRes.body.students.length > 0) {
          createdStudentId = searchRes.body.students[0].id
        }
      })
    })
  })

  it('should fail to create duplicate student', () => {
    cy.api({
      method: 'POST',
      url: '/api/admin/students/add',
      body: {
        roll_no: testStudentRoll,
        name: 'Duplicate Student',
        email: testStudentEmail
      }
    }).then((res) => {
      expect(res.status).to.eq(400)
      expect(res.body.error).to.include('already exists')
    })
  })

  it('should fail to create student with missing fields', () => {
    cy.api({
      method: 'POST',
      url: '/api/admin/students/add',
      body: {
        name: 'Incomplete Student'
      }
    }).then((res) => {
      expect(res.status).to.eq(400)
    })
  })

  it('should update the created student', () => {
    if (!createdStudentId) {
      cy.log('Skipping update test, student was not created')
      return
    }

    cy.api({
      method: 'PUT',
      url: `/api/admin/students/${createdStudentId}`,
      body: {
        name: 'Updated Test Student',
        room_no: '102'
      }
    }).then((res) => {
      expect(res.status).to.eq(200)
      expect(res.body.message).to.eq('Student updated successfully.')
    })
  })

  it('should delete the created student', () => {
    if (!createdStudentId) {
      cy.log('Skipping delete test, student was not created')
      return
    }

    cy.api({
      method: 'DELETE',
      url: `/api/admin/students/${createdStudentId}`
    }).then((res) => {
      expect(res.status).to.eq(200)
      expect(res.body.message).to.eq('Student deleted successfully.')
    })
  })

  it('should fail to delete non-existent student', () => {
    const fakeUUID = '123e4567-e89b-12d3-a456-426614174000'
    cy.api({
      method: 'DELETE',
      url: `/api/admin/students/${fakeUUID}`
    }).then((res) => {
      expect(res.status).to.eq(404)
    })
  })

  it('should export students to CSV', () => {
    cy.api({
      method: 'GET',
      url: '/api/admin/students/export'
    }).then((res) => {
      expect(res.status).to.eq(200)
      expect(res.headers['content-type']).to.include('text/csv')
      expect(res.body).to.be.a('string')
      expect(res.body).to.include('Roll No,Name,Email')
    })
  })
})
