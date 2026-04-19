# Fix My Campus - Backend

A comprehensive hostel management and complaint resolution system for NITD (National Institute of Technology Delhi). This backend provides APIs for student complaint management, staff administration, worker task assignment, and campus announcements.

## Project Overview

**FixMyCampus** is a platform designed to streamline hostel operations by:
- Enabling students to lodge maintenance complaints
- Automating worker assignment based on department expertise
- Providing administrators with student and staff management tools
- Facilitating announcement distribution across different roles and hostels
- Tracking complaint resolution with feedback mechanisms

---

## Technology Stack

- **Runtime**: Node.js
- **Framework**: Express.js v5.2.1
- **Database**: PostgreSQL (Neon DB)
- **Authentication**: Google OAuth 2.0, JWT (JSON Web Tokens)
- **File Storage**: Cloudinary
- **File Upload**: Multer
- **Password Hashing**: Bcrypt
- **Additional**: CSV parsing, Cookie management, CORS

---

## Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- PostgreSQL database (Neon)
- Google OAuth credentials
- Cloudinary account

### Environment Variables

Create a `.env` file in the root directory with the following variables:

```
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Database
DATABASE_URL=postgresql://user:password@host:port/database

# Authentication
JWT_SECRET=your_jwt_secret_key
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### Installation Steps

```bash
# Clone the repository
git clone <repository_url>
cd fix-my-campus-backend

# Install dependencies
npm install

# Run the server
npm start

# For development with auto-reload
npm run dev
```

---

## API Routes Documentation

### Base URL
```
http://localhost:5000/api
```

---

## 1. Authentication Routes (`/auth`)

### Student Authentication

#### POST `/auth/google`
**Description**: Google OAuth login for students  
**Authentication**: Not required (public)  
**Request Body**:
```json
{
  "code": "authorization_code_from_google"
}
```
**Response**: 
```json
{
  "user": { "id", "email", "name", "hostel_name", "profile_picture", ... },
  "role": "student"
}
```
**Notes**: 
- Only institutional emails ending with `@nitdelhi.ac.in` are allowed
- Student must be pre-registered in the system
- Creates/updates student record and sets JWT cookie

#### PUT `/auth/student/onboard`
**Description**: Skip student onboarding setup  
**Authentication**: Required (JWT)  
**Authorization**: Student only  
**Response**:
```json
{
  "message": "Onboarding skipped.",
  "user": { ... }
}
```

#### PUT `/auth/student/profile`
**Description**: Update student profile information  
**Authentication**: Required (JWT)  
**Authorization**: Student only  
**Request Body**:
```json
{
  "phone_no": "9876543210",
  "branch": "Computer Science",
  "year_of_joining": 2023,
  "programme": "B.Tech",
  "gender": "M/F"
}
```
**Response**:
```json
{
  "message": "Profile updated successfully.",
  "user": { ... }
}
```

---

### Admin/Worker Authentication

#### POST `/auth/login`
**Description**: Email & password login for admins and workers  
**Authentication**: Not required (public)  
**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "password123",
  "role": "admin" | "worker"
}
```
**Response**:
```json
{
  "user": { "id", "name", "email", "position", "hostel_name", ... },
  "role": "admin" | "worker",
  "message": "Login successful"
}
```

#### GET `/auth/profile`
**Description**: Fetch current user profile (Auto-login via cookie)  
**Authentication**: Required (JWT)  
**Response**:
```json
{
  "user": { ... },
  "role": "student" | "admin" | "worker",
  "message": "Profile Data Fetched Successfully"
}
```

#### POST `/auth/logout`
**Description**: Logout user and clear session cookie  
**Authentication**: Not required  
**Response**:
```json
{
  "message": "Logged out successfully"
}
```

#### PUT `/auth/admin/profile/password`
**Description**: Change admin password  
**Authentication**: Required (JWT)  
**Authorization**: Admin only  
**Request Body**:
```json
{
  "currentPassword": "oldPassword123",
  "newPassword": "newPassword456"
}
```
**Response**:
```json
{
  "message": "Password updated successfully."
}
```

---

## 2. Student Management Routes (`/admin/students`)

**Authentication**: Required (JWT)  
**Authorization**: Admin only (with role-based restrictions for Wardens)

### GET `/admin/students`
**Description**: Fetch paginated list of students with search and sort options  
**Query Parameters**:
- `page` (int, default: 1) - Page number
- `limit` (int, default: 10) - Items per page
- `sortBy` (string, default: "room_no") - Sort column (roll_no, name, email, hostel_name, room_no, floor_no)
- `sortOrder` (string, default: "ASC") - ASC or DESC
- `search` (string) - Search term (searches name, roll_no, email, hostel_name, room_no)

**Response**:
```json
{
  "students": [ { "id", "roll_no", "name", "email", "hostel_name", ... } ],
  "pagination": {
    "totalStudents": 150,
    "fetchedStudents": 10,
    "totalPages": 15,
    "currentPage": 1,
    "limit": 10
  }
}
```
**Note**: Wardens can only see students in their assigned hostel

### POST `/admin/students/upload-csv`
**Description**: Upload and parse CSV file to bulk add/update students  
**Content-Type**: multipart/form-data  
**Form Data**:
- `file` (File) - CSV file

**CSV Format** (Required columns):
```
roll_no, name, email, hostel_name, room_no, floor_no
```

**Response**:
```json
{
  "message": "Processed CSV. Students added/updated: 45, Errors: 2",
  "errors": [
    { "type": "message", "message": "Error description" }
  ]
}
```

### POST `/admin/students/add`
**Description**: Manually add a single student  
**Request Body**:
```json
{
  "roll_no": "2023CSE001",
  "name": "John Doe",
  "email": "2023cse001@nitdelhi.ac.in",
  "hostel_name": "Hostel A",
  "room_no": "101",
  "floor_no": 1
}
```
**Response**:
```json
{
  "message": "Student added successfully."
}
```

### PUT `/admin/students/:id`
**Description**: Update specific student details  
**Request Body** (all optional):
```json
{
  "name": "Jane Doe",
  "roll_no": "2023CSE002",
  "email": "2023cse002@nitdelhi.ac.in",
  "hostel_name": "Hostel B",
  "room_no": "201",
  "floor_no": 2
}
```
**Response**:
```json
{
  "message": "Student updated successfully."
}
```

### DELETE `/admin/students/:id`
**Description**: Delete a specific student  
**Response**:
```json
{
  "message": "Student deleted successfully."
}
```

### POST `/admin/students/bulk-delete`
**Description**: Delete multiple students at once  
**Request Body**:
```json
{
  "ids": ["uuid1", "uuid2", "uuid3"]
}
```
**Response**:
```json
{
  "message": "Successfully deleted 3 students."
}
```

### GET `/admin/students/export`
**Description**: Export students as CSV file  
**Query Parameters**:
- `sortBy` (string, default: "room_no")
- `sortOrder` (string, default: "ASC")
- `search` (string)

**Response**: CSV file download
```
"Roll No","Name","Email","Hostel Name","Room No","Floor No"
"2023CSE001","John Doe","2023cse001@nitdelhi.ac.in","Hostel A","101","1"
```

---

## 3. Chief Warden Routes (`/admin/chief`)

**Authentication**: Required (JWT)  
**Authorization**: Chief Warden only

### GET `/admin/chief/wardens`
**Description**: Fetch all wardens and admins (except other Chief Wardens)  
**Response**:
```json
[
  {
    "id": "uuid",
    "name": "Warden Name",
    "email": "warden@example.com",
    "phone_no": "9876543210",
    "position": "Hostel Warden" | "Associate Warden" | "Junior Assistant",
    "hostel_name": "Hostel A",
    "created_at": "2024-01-15T10:00:00Z",
    "last_login": "2024-04-15T14:30:00Z"
  }
]
```

### POST `/admin/chief/wardens`
**Description**: Create new warden/admin account with auto-generated password  
**Request Body**:
```json
{
  "name": "New Warden",
  "email": "newwarden@example.com",
  "phone_no": "9876543210",
  "position": "Hostel Warden" | "Associate Warden" | "Junior Assistant",
  "hostel_name": "Hostel A" (required except for Junior Assistant)
}
```
**Response**:
```json
{
  "message": "Account created successfully.",
  "admin": { "id", "name", "email", "position", "hostel_name" },
  "generatedPassword": "SecurePass123!"
}
```

### PUT `/admin/chief/wardens/:id`
**Description**: Update warden/admin account details  
**Request Body** (all optional):
```json
{
  "name": "Updated Name",
  "email": "updated@example.com",
  "phone_no": "9876543210",
  "position": "Hostel Warden",
  "hostel_name": "Hostel B",
  "password": "newPassword123" (optional)
}
```
**Response**:
```json
{
  "message": "Account updated successfully",
  "admin": { "id", "name", "email", "position", "hostel_name" }
}
```

### DELETE `/admin/chief/wardens/:id`
**Description**: Delete a warden/admin account  
**Response**:
```json
{
  "message": "Account deleted successfully."
}
```

### GET `/admin/chief/hostel-analytics`
**Description**: Get complaint analytics grouped by hostel  
**Response**:
```json
[
  {
    "hostel_name": "Hostel A",
    "total_complaints": 45,
    "resolved_complaints": 38,
    "pending_complaints": 7,
    "escalated_complaints": 2
  }
]
```

---

## 4. Warden Routes (`/admin/warden`)

**Authentication**: Required (JWT)  
**Authorization**: Hostel Warden or Associate Warden

### GET `/admin/warden/workers`
**Description**: Fetch all workers assigned to the warden's hostel  
**Response**:
```json
[
  {
    "id": "uuid",
    "name": "Worker Name",
    "email": "worker@example.com",
    "phone_no": "9876543210",
    "gender": "M/F",
    "department": "Maintenance",
    "sub_work_category": "Plumbing",
    "current_rating": 4.5,
    "rating_count": 12,
    "created_at": "2024-01-15T10:00:00Z",
    "last_login": "2024-04-15T14:30:00Z"
  }
]
```

### POST `/admin/warden/workers`
**Description**: Create new worker account with auto-generated password  
**Request Body**:
```json
{
  "name": "New Worker",
  "email": "newworker@example.com",
  "phone_no": "9876543210",
  "gender": "M" | "F",
  "department": "Maintenance",
  "sub_work_category": "Plumbing"
}
```
**Response**:
```json
{
  "message": "Worker account created successfully.",
  "worker": { "id", "name", "email", "department", "sub_work_category" },
  "generatedPassword": "SecurePass123!"
}
```

### PUT `/admin/warden/workers/:id`
**Description**: Update worker account details  
**Request Body** (all optional):
```json
{
  "name": "Updated Worker",
  "email": "updated@example.com",
  "phone_no": "9876543210",
  "gender": "M",
  "department": "Maintenance",
  "sub_work_category": "Plumbing",
  "password": "newPassword123" (optional)
}
```
**Response**:
```json
{
  "message": "Worker account updated successfully",
  "worker": { "id", "name", "email", "department" }
}
```

### DELETE `/admin/warden/workers/:id`
**Description**: Delete a worker account  
**Response**:
```json
{
  "message": "Worker account deleted successfully."
}
```

### GET `/admin/warden/performance`
**Description**: Fetch performance metrics for workers  
**Response**:
```json
[
  {
    "worker_id": "uuid",
    "name": "Worker Name",
    "total_complaints": 25,
    "resolved_complaints": 23,
    "average_resolution_time": "2.5 hours",
    "current_rating": 4.7
  }
]
```

### GET `/admin/warden/workers/:id/complaints`
**Description**: Fetch complaints assigned to a specific worker  
**Query Parameters**:
- `status` (string) - Filter by complaint status
- `limit` (int) - Limit results

**Response**:
```json
[
  {
    "id": "uuid",
    "student_id": "uuid",
    "worker_id": "uuid",
    "department": "Maintenance",
    "sub_category": "Plumbing",
    "description": "Leaky tap in room",
    "status": "In Progress",
    "assigned_at": "2024-04-15T10:00:00Z",
    "complaint_image": "https://cloudinary.com/image.jpg"
  }
]
```

---

## 5. Complaint Routes (`/complaints`)

**Authentication**: Required (JWT)

### Student Complaint Routes

#### POST `/complaints/student`
**Description**: Lodge a new complaint (with optional image)  
**Content-Type**: multipart/form-data  
**Form Data**:
- `department` (string, required) - Department category
- `sub_category` (string, required) - Sub-category
- `description` (string, required) - Max 40 words
- `complaint_image` (File, optional) - Complaint image

**Response**:
```json
{
  "id": "uuid",
  "student_id": "uuid",
  "department": "Maintenance",
  "sub_category": "Plumbing",
  "description": "Leaky tap in room",
  "complaint_image": "https://cloudinary.com/image.jpg",
  "status": "Worker assigned" | "Initiated",
  "worker_id": "uuid" | null,
  "assigned_at": "2024-04-15T10:00:00Z",
  "created_at": "2024-04-15T10:00:00Z"
}
```
**Notes**:
- Students can only have one active complaint per department/sub-category
- Worker is auto-assigned based on current workload (equal distribution)
- Description limited to 40 words

#### GET `/complaints/student/dashboard`
**Description**: Get student dashboard statistics  
**Response**:
```json
{
  "total_complaints": 5,
  "active_complaints": 2,
  "resolved_complaints": 3,
  "escalated_complaints": 1,
  "average_resolution_time": "3.2 hours"
}
```

#### PUT `/complaints/student/:id/escalate`
**Description**: Escalate a complaint to higher authority  
**Request Body** (optional):
```json
{
  "escalation_reason": "Not satisfied with worker response"
}
```
**Response**:
```json
{
  "message": "Complaint escalated successfully.",
  "complaint": { "id", "is_escalated", "escalated_at" }
}
```

#### PUT `/complaints/student/:id/feedback`
**Description**: Provide feedback on resolved complaint  
**Request Body**:
```json
{
  "rating": 5,
  "feedback_comment": "Worker was very professional and efficient"
}
```
**Response**:
```json
{
  "message": "Feedback submitted successfully.",
  "complaint": { "id", "rating", "feedback_comment", "feedback_submitted_at" }
}
```

---

### Worker Complaint Routes

#### GET `/complaints/worker/dashboard`
**Description**: Get worker dashboard statistics  
**Response**:
```json
{
  "assigned_complaints": 8,
  "in_progress": 3,
  "resolved": 5,
  "pending": 0,
  "average_rating": 4.6,
  "total_feedbacks": 15
}
```

#### PUT `/complaints/worker/:id/resolve`
**Description**: Mark complaint as resolved with before/after images  
**Content-Type**: multipart/form-data  
**Form Data**:
- `resolution_notes` (string, required) - Notes on resolution
- `resolved_image` (File, optional) - After image

**Response**:
```json
{
  "message": "Complaint resolved successfully.",
  "complaint": {
    "id": "uuid",
    "status": "Resolved",
    "resolution_notes": "Fixed the leaky tap",
    "resolved_image": "https://cloudinary.com/image.jpg",
    "resolved_at": "2024-04-15T14:30:00Z"
  }
}
```

---

## 6. Announcement Routes (`/announcements`)

**Authentication**: Required (JWT)

### GET `/announcements`
**Description**: Fetch announcements based on user role and hostel  
**Response**:
```json
[
  {
    "id": "uuid",
    "title": "Water Supply Maintenance",
    "content": "Water supply will be shut down on April 20 for 4 hours.",
    "type": "Common" | "Hostel" | "Worker",
    "hostel_name": "Hostel A" | null,
    "author_name": "Admin Name",
    "created_by": "uuid",
    "created_at": "2024-04-15T10:00:00Z"
  }
]
```
**Visibility Rules**:
- **Students**: See "Common" + hostel/worker announcements for their hostel
- **Wardens**: See "Common" + announcements for their hostel
- **Chief Warden/Junior Assistant**: See all announcements
- **Workers**: See "Common" + worker announcements for their hostel

### POST `/announcements`
**Description**: Create a new announcement  
**Request Body**:
```json
{
  "title": "Announcement Title",
  "content": "Full announcement content",
  "type": "Common" | "Hostel" | "Worker"
}
```
**Response**:
```json
{
  "message": "Announcement created successfully",
  "announcement": {
    "id": "uuid",
    "title": "Announcement Title",
    "content": "Full announcement content",
    "type": "Common",
    "hostel_name": null,
    "created_by": "uuid",
    "created_at": "2024-04-15T10:00:00Z"
  }
}
```
**Authorization Rules**:
- **Chief Warden/Junior Assistant**: Can only create "Common" announcements
- **Hostel Warden/Associate Warden**: Can create "Common", "Hostel", or "Worker" (scoped to their hostel)
- **Workers**: Can only create "Worker" announcements (scoped to their hostel)
- **Students**: Cannot create announcements

---

## Error Handling

All endpoints follow a consistent error response format:

```json
{
  "error": "Error description",
  "statusCode": 400 | 401 | 403 | 404 | 500
}
```

### Common HTTP Status Codes

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (no/invalid token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 500 | Server Error |

---

## Authentication & Authorization

### Token Management
- **Type**: JWT (JSON Web Tokens)
- **Expiry**: 7 days
- **Storage**: HTTP-only cookies (XSS protected)
- **CSRF Protection**: SameSite cookie attribute

### User Roles

1. **Student**
   - Lodge complaints
   - View personal complaints and feedback
   - Escalate complaints
   - Receive hostel-specific announcements

2. **Admin**
   - **Chief Warden**: Full system access, manage all wardens, view all data
   - **Hostel Warden**: Manage hostel-specific students and workers
   - **Associate Warden**: Similar to Hostel Warden with limited actions
   - **Junior Assistant**: System-wide announcements and general admin tasks

3. **Worker**
   - View assigned complaints
   - Resolve complaints
   - Receive performance ratings
   - Create worker-specific announcements

---

## Database Schema Summary

### Key Tables

**students**
- id, google_id, name, email, roll_no, hostel_name, room_no, floor_no, phone_no, branch, year_of_joining, programme, gender, profile_picture, is_onboarded, last_login, created_at

**admins**
- id, name, email, password_hash, phone_no, position, hostel_name, photo, requires_password_change, last_login, created_at

**workers**
- id, name, email, password_hash, phone_no, gender, hostel_name, department, sub_work_category, photo, current_rating, rating_count, last_login, created_at

**complaints**
- id, student_id, worker_id, department, sub_category, description, complaint_image, status, assigned_at, resolved_at, resolution_notes, resolved_image, is_escalated, escalated_at, rating, feedback_comment, feedback_submitted_at, created_at

**announcements**
- id, title, content, type, hostel_name, created_by, created_at

---

## Development Notes

### RBAC (Role-Based Access Control)
- Wardens can only manage resources within their assigned hostel
- Students are restricted to their own complaints and hostel announcements
- Admin actions are restricted by position level

### CSV Import
- Supports bulk student addition/update
- Validates roll_no and name columns
- Provides detailed error reporting per row
- Enforces RBAC restrictions during import

### Complaint Assignment
- Workers are auto-assigned based on:
  - Department match
  - Sub-category match
  - Current workload (ascending order)

### Image Upload
- Uses Cloudinary for secure cloud storage
- Supports complaint images and resolution photos
- Automatic cleanup of temporary files

---

## Security Features

✅ HTTP-only cookies for JWT tokens  
✅ Bcrypt password hashing (10 rounds)  
✅ CORS configuration with credentials  
✅ Request validation and sanitization  
✅ Role-based access control (RBAC)  
✅ SQL injection prevention (parameterized queries)  
✅ XSS protection via secure cookie settings  
✅ CSRF protection via SameSite cookie attribute  

---

## Support & Contact

For issues, questions, or feature requests, please open an issue in the repository.

---

## License

ISC License - See LICENSE file for details
