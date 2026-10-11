-- Seed data for Velour Men's Hair Salon (admin password hashed via server/scripts/seed.js)
USE velourmen;

DELETE FROM notifications;
DELETE FROM reviews;
DELETE FROM appointment_status_history;
DELETE FROM appointment_slot_locks;
DELETE FROM slot_blocks;
DELETE FROM appointments;
DELETE FROM discount_services;
DELETE FROM discounts;
DELETE FROM banners;
DELETE FROM package_services;
DELETE FROM packages;
DELETE FROM staff_services;
DELETE FROM staff_available_days;
DELETE FROM staff;
DELETE FROM service_available_days;
DELETE FROM services;
DELETE FROM categories;
DELETE FROM customers;
DELETE FROM admins;
DELETE FROM salon_settings;

INSERT INTO salon_settings (
  salon_name, opening_time, closing_time, slot_interval_minutes,
  phone, email, address, social_links, currency, timezone, booking_horizon_days, about_text
) VALUES (
  'Velour Men''s Salon',
  '10:00:00',
  '22:00:00',
  30,
  '03007273029',
  'farizahmad112005@gmail.com',
  'Market Place 204 1st Floor Near Crumble, Canal Road, Faisalabad',
  JSON_OBJECT('instagram', 'https://instagram.com/veloursalon', 'facebook', 'https://facebook.com/veloursalon', 'tiktok', 'https://tiktok.com/@veloursalon'),
  'PKR',
  'Asia/Karachi',
  30,
  'Velour is Faisalabad''s premium men''s hair salon and barber shop — sharp cuts, precise fades, beard grooming, and packages built for modern men. Visit us at Canal Road or book online.'
);

INSERT INTO categories (id, name, slug, description, image, is_active, sort_order) VALUES
(1, 'Haircuts', 'haircuts', 'Classic and modern cuts tailored for men.', '/uploads/placeholders/hair.svg', 1, 1),
(2, 'Fades & Styles', 'fades-styles', 'Skin fades, tapers, and structured finishes.', '/uploads/placeholders/hair.svg', 1, 2),
(3, 'Beard & Shave', 'beard-shave', 'Beard sculpting, hot towel shaves, and line-ups.', '/uploads/placeholders/skin.svg', 1, 3),
(4, 'Hair Color', 'hair-color', 'Subtle blends, grey coverage, and bold tones.', '/uploads/placeholders/makeup.svg', 1, 4),
(5, 'Treatments', 'treatments', 'Scalp care, hair spa, and restorative rituals.', '/uploads/placeholders/spa.svg', 1, 5),
(6, 'Grooming Packages', 'grooming-packages', 'Complete looks for work, events, and weekends.', '/uploads/placeholders/bridal.svg', 1, 6);

INSERT INTO services (id, category_id, name, description, price, duration_minutes, image, is_active, sort_order) VALUES
(1, 1, 'Classic Haircut', 'Clean scissor cut with consultation and finish.', 1500.00, 30, '/uploads/placeholders/svc-style.svg', 1, 1),
(2, 1, 'Premium Cut & Style', 'Detailed cut, wash, and styled finish.', 2200.00, 45, '/uploads/placeholders/svc-style.svg', 1, 2),
(3, 1, 'Kids Haircut', 'Patient, precise cuts for ages 12 and under.', 1000.00, 30, '/uploads/placeholders/svc-wash.svg', 1, 3),
(4, 2, 'Skin Fade', 'Sharp skin-to-length fade with clean edges.', 2000.00, 40, '/uploads/placeholders/svc-treat.svg', 1, 1),
(5, 2, 'Mid / Low Fade', 'Balanced fade blended into your preferred length.', 1800.00, 35, '/uploads/placeholders/svc-treat.svg', 1, 2),
(6, 2, 'Taper Cut', 'Refined neck and side taper for a polished look.', 1600.00, 30, '/uploads/placeholders/svc-style.svg', 1, 3),
(7, 2, 'Crew Cut / Buzz', 'Uniform clipper cut with clean outline.', 1200.00, 25, '/uploads/placeholders/svc-wash.svg', 1, 4),
(8, 3, 'Beard Trim & Shape', 'Sculpted beard with razor line-up.', 800.00, 20, '/uploads/placeholders/svc-cleanup.svg', 1, 1),
(9, 3, 'Hot Towel Shave', 'Classic straight-razor shave with hot towel.', 1800.00, 35, '/uploads/placeholders/svc-skin.svg', 1, 2),
(10, 3, 'Haircut + Beard Combo', 'Full cut with beard shape and finish.', 2500.00, 50, '/uploads/placeholders/svc-glow.svg', 1, 3),
(11, 3, 'Mustache / Line-Up', 'Crisp facial hair edges and detail work.', 500.00, 15, '/uploads/placeholders/svc-cleanup.svg', 1, 4),
(12, 4, 'Grey Blending', 'Soft coverage that looks natural, not painted.', 3500.00, 60, '/uploads/placeholders/svc-hydrate.svg', 1, 1),
(13, 4, 'Full Color', 'Even color application for a bold or refreshed look.', 4500.00, 75, '/uploads/placeholders/svc-deep.svg', 1, 2),
(14, 4, 'Highlights / Foils', 'Dimensional lightening for texture and depth.', 5500.00, 90, '/uploads/placeholders/svc-glow.svg', 1, 3),
(15, 5, 'Hair Spa', 'Deep conditioning and scalp massage ritual.', 3000.00, 50, '/uploads/placeholders/svc-hairspa.svg', 1, 1),
(16, 5, 'Scalp Treatment', 'Targeted care for dryness, oil, or buildup.', 2500.00, 40, '/uploads/placeholders/svc-hydration.svg', 1, 2),
(17, 5, 'Keratin Smooth', 'Smoothing treatment for frizz control and shine.', 8000.00, 120, '/uploads/placeholders/svc-treat.svg', 1, 3),
(18, 6, 'Executive Groom', 'Premium cut, beard tidy, and style finish.', 3200.00, 55, '/uploads/placeholders/svc-event.svg', 1, 1),
(19, 6, 'Wedding Groom Prep', 'Event-ready cut and beard for the big day.', 5000.00, 70, '/uploads/placeholders/svc-bridal-mu.svg', 1, 2),
(20, 1, 'Evening Express Cut', 'Quick tidy-up currently paused for staffing.', 1200.00, 25, '/uploads/placeholders/svc-night.svg', 0, 5);

-- Weekdays: 0 Sun ... 6 Sat. Most services Mon-Sat; wedding prep includes Sunday.
INSERT INTO service_available_days (service_id, weekday)
SELECT s.id, d.weekday
FROM services s
CROSS JOIN (
  SELECT 1 AS weekday UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6
) d
WHERE s.id NOT IN (19);

INSERT INTO service_available_days (service_id, weekday)
SELECT s.id, d.weekday
FROM services s
CROSS JOIN (
  SELECT 0 AS weekday UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6
) d
WHERE s.id IN (19);

INSERT INTO packages (id, name, description, image, original_price, package_price, is_active, sort_order) VALUES
(1, 'Sharp & Clean', 'Skin fade, beard trim, and scalp refresh in one visit.', '/uploads/placeholders/pkg-glow.svg', 5300.00, 4200.00, 1, 1),
(2, 'Groom Ready', 'Wedding groom prep with hot towel shave.', '/uploads/placeholders/pkg-bridal.svg', 6800.00, 5800.00, 1, 2),
(3, 'Fade & Finish', 'Mid fade with classic haircut polish.', '/uploads/placeholders/pkg-radiance.svg', 3300.00, 2800.00, 1, 3),
(4, 'Color Reset', 'Grey blending with hair spa recovery.', '/uploads/placeholders/pkg-evening.svg', 6500.00, 5500.00, 1, 4);

INSERT INTO package_services (package_id, service_id) VALUES
(1, 4), (1, 8), (1, 16),
(2, 19), (2, 9),
(3, 5), (3, 1),
(4, 12), (4, 15);

INSERT INTO banners (title, subtitle, image, cta_text, cta_url, is_active, sort_order) VALUES
('Fades That Hit Different', 'Precision fades and clean line-ups by Velour barbers.', '/uploads/placeholders/banner-1.svg', 'Book a Fade', '/booking', 1, 1),
('Groom Season', 'Look sharp for the aisle — cuts, shaves, and event prep.', '/uploads/placeholders/banner-2.svg', 'View Packages', '/packages', 1, 2),
('Walk In or Book Ahead', 'Open 10 AM – 10 PM. Reserve your chair online.', '/uploads/placeholders/banner-3.svg', 'Book Now', '/booking', 1, 3);

INSERT INTO discounts (id, code, title, description, discount_type, discount_value, start_date, end_date, category_id, usage_limit, usage_count, is_active) VALUES
(1, 'FADE15', 'Fade Week', '15% OFF Fades & Styles', 'percentage', 15.00, CURDATE() - INTERVAL 5 DAY, CURDATE() + INTERVAL 90 DAY, 2, 200, 0, 1),
(2, 'VELOUR300', 'Welcome Cut', 'Rs. 300 off selected haircuts', 'fixed', 300.00, CURDATE() - INTERVAL 2 DAY, CURDATE() + INTERVAL 60 DAY, 1, 100, 0, 1),
(3, 'BEARD10', 'Beard Soft Launch', '10% off beard & shave services', 'percentage', 10.00, CURDATE(), CURDATE() + INTERVAL 120 DAY, 3, 50, 0, 1);

INSERT INTO discount_services (discount_id, service_id) VALUES
(1, 4), (1, 5), (1, 6), (1, 7),
(2, 1), (2, 2), (2, 3),
(3, 8), (3, 9), (3, 10);

INSERT INTO customers (id, name, age, phone, email, password_hash, is_active) VALUES
(1, 'Ahmed Khan', 28, '03001234001', 'ahmed@example.com', NULL, 1),
(2, 'Bilal Malik', 32, '03001234002', 'bilal@example.com', NULL, 1),
(3, 'Hassan Ahmed', 25, '03001234003', NULL, NULL, 1);

INSERT INTO staff (id, name, title, role, bio, photo, phone, is_active, sort_order) VALUES
(1, 'Zain Ali', 'Senior Barber', 'barber', 'Precision fades and classic cuts with a clean finish.', '/uploads/placeholders/svc-style.svg', '03001111001', 1, 1),
(2, 'Omar Farooq', 'Fade Specialist', 'barber', 'Skin fades, tapers, and sharp line-ups.', '/uploads/placeholders/svc-treat.svg', '03001111002', 1, 2),
(3, 'Rayan Shah', 'Grooming Expert', 'barber', 'Beard sculpting, hot towel shaves, and executive looks.', '/uploads/placeholders/svc-cleanup.svg', '03001111003', 1, 3);

INSERT INTO staff_available_days (staff_id, weekday)
SELECT s.id, d.weekday
FROM staff s
CROSS JOIN (
  SELECT 1 AS weekday UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6
) d;

-- Featured reviews (no mock appointments)
INSERT INTO reviews (appointment_id, customer_name, rating, comment, service_name, is_visible, is_featured) VALUES
(NULL, 'Ahmed Khan', 5, 'Best men''s salon in Faisalabad — skin fade was perfect.', 'Skin Fade', 1, 1),
(NULL, 'Bilal Malik', 5, 'Top barber shop on Canal Road. Hair spa and cut were excellent.', 'Hair Spa', 1, 1),
(NULL, 'Hassan Ahmed', 4, 'Great haircut and beard combo. Will book Velour again.', 'Haircut + Beard Combo', 1, 0),
(NULL, 'Usmar Raza', 5, 'Classic cut done right. Professional barbers and clean shop.', 'Classic Haircut', 1, 1);
