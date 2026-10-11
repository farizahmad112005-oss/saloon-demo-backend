# Luxe Belle API

Base URL: `http://localhost:5000/api`

Auth header: `Authorization: Bearer <token>`

Common response:

```json
{ "success": true, "message": "Success", "data": {} }
```

Error:

```json
{ "success": false, "message": "…", "details": [] }
```

## Auth

### POST `/auth/admin/login`
Body: `{ "email", "password" }`  
Returns: `{ token, user }`

### POST `/auth/customer/register`
Body: `{ "name", "phone", "password", "email?", "age?" }`

### POST `/auth/customer/login`
Body: `{ "phone", "password" }`

### GET `/auth/admin/profile` — Admin
### PUT `/auth/admin/profile` — Admin

## Public content

- `GET /settings`
- `GET /categories`
- `GET /services` · `GET /services/:id` · `GET /services/:id/availability`
- `GET /packages` · `GET /packages/:id` · `GET /packages/:id/availability`
- `GET /banners`
- `GET /discounts/active`
- `POST /discounts/validate` — Body: `{ code, booking_type, service_id, original_price }`
- `GET /reviews?top=5`

## Appointments

### POST `/appointments`
Optional customer JWT. Body:

```json
{
  "booking_type": "service",
  "service_id": 1,
  "appointment_date": "2026-08-15",
  "appointment_time": "15:00:00",
  "client_name": "Ayesha",
  "client_age": 28,
  "client_phone": "03001234567",
  "discount_code": "GLOW20"
}
```

Conflict `409`:

```json
{
  "success": false,
  "message": "This time slot has just been booked by another customer. Please select another time."
}
```

### POST `/appointments/lookup` — Body `{ "phone" }`
### GET `/appointments/mine` — Customer JWT
### GET `/appointments/:id`
### POST `/reviews` — Body `{ appointment_id, rating, customer_name, comment? }`

## Admin

All routes require admin JWT.

- `GET /admin/dashboard/stats`
- `GET /admin/dashboard/chart?year=2026`
- `GET /admin/appointments` — filters: `preset`, `date`, `from_date`, `to_date`, `status`, `service_id`, `q`, `page`, `limit`
- `PATCH /admin/appointments/:id/status` — Body `{ "status" }`
- `GET|PUT /admin/settings`
- CRUD: `/admin/categories`, `/admin/services`, `/admin/packages`, `/admin/banners`, `/admin/discounts`
- `GET /admin/customers`
- `PATCH /admin/reviews/:id` · `DELETE /admin/reviews/:id`
- `POST /admin/uploads` — multipart field `image`

## Socket.IO

Connect to `http://localhost:5000` with `auth: { token }`.

Admin events:

- `appointment:created`
- `appointment:statusChanged`
- `appointment:updated`
