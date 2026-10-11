import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../middleware/validate.js';
import { optionalAuth, requireAdmin, requireCustomer } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

import * as auth from '../controllers/authController.js';
import * as categories from '../controllers/categoryController.js';
import * as services from '../controllers/serviceController.js';
import * as packages from '../controllers/packageController.js';
import * as banners from '../controllers/bannerController.js';
import * as discounts from '../controllers/discountController.js';
import * as appointments from '../controllers/appointmentController.js';
import * as reviews from '../controllers/reviewController.js';
import * as settings from '../controllers/settingsController.js';
import * as dashboard from '../controllers/dashboardController.js';
import * as customers from '../controllers/customerController.js';
import * as uploads from '../controllers/uploadController.js';
import * as slotBlocks from '../controllers/slotBlockController.js';
import * as staff from '../controllers/staffController.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again later.' },
});

const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many lookup attempts. Please try again later.' },
});

// Auth
router.post('/auth/admin/login', authLimiter, auth.adminLoginValidators, validate, auth.adminLogin);
router.post('/auth/customer/register', authLimiter, auth.customerRegisterValidators, validate, auth.customerRegister);
router.post('/auth/customer/login', authLimiter, auth.customerLoginValidators, validate, auth.customerLogin);
router.get('/auth/admin/profile', ...requireAdmin, auth.getAdminProfile);
router.put('/auth/admin/profile', ...requireAdmin, auth.updateAdminProfile);
router.get('/customers/me', ...requireCustomer, customers.getMe);

// Public content
router.get('/settings', settings.getPublicSettings);
router.get('/categories', optionalAuth, categories.listCategories);
router.get('/categories/:id', categories.getCategory);
router.get('/services', optionalAuth, services.listServices);
router.get('/services/:id', services.getService);
router.get('/services/:id/availability', services.getServiceAvailability);
router.get('/packages', optionalAuth, packages.listPackages);
router.get('/packages/:id', packages.getPackage);
router.get('/packages/:id/availability', packages.getPackageAvailability);
router.get('/banners', optionalAuth, banners.listBanners);
router.get('/discounts/active', discounts.listPublicDiscounts);
router.post('/discounts/validate', discounts.validateDiscount);
router.get('/reviews', optionalAuth, reviews.listReviews);
router.get('/staff', optionalAuth, staff.listPublic);
router.get('/staff/:id', optionalAuth, staff.getOne);
router.get('/staff/:id/availability', staff.getAvailability);

// Appointments (public create + guest lookup)
router.post('/appointments', optionalAuth, appointments.createValidators, validate, appointments.create);
router.post('/appointments/lookup', lookupLimiter, appointments.lookup);
router.get('/appointments/mine', ...requireCustomer, appointments.listMine);
router.get('/appointments/:id', optionalAuth, appointments.getOne);
router.post('/reviews', optionalAuth, reviews.reviewValidators, validate, reviews.createReview);

// Admin
router.get('/admin/dashboard/stats', ...requireAdmin, dashboard.stats);
router.get('/admin/dashboard/chart', ...requireAdmin, dashboard.chart);
router.get('/admin/dashboard/monthly-chart', ...requireAdmin, dashboard.monthlyChart);
router.get('/admin/dashboard/in-progress', ...requireAdmin, dashboard.inProgress);
router.get('/admin/settings', ...requireAdmin, settings.getAdminSettings);
router.put('/admin/settings', ...requireAdmin, settings.putSettings);
router.get('/admin/appointments', ...requireAdmin, appointments.adminList);
router.patch('/admin/appointments/:id/status', ...requireAdmin, appointments.updateStatus);
router.get('/admin/slots', ...requireAdmin, slotBlocks.dayDesk);
router.get('/admin/slots/next', ...requireAdmin, slotBlocks.previewNext);
router.post('/admin/slots/cancel', ...requireAdmin, slotBlocks.cancelValidators, validate, slotBlocks.cancelFromDesk);
router.post('/admin/slots/shift', ...requireAdmin, slotBlocks.shiftValidators, validate, slotBlocks.shiftFromDesk);
router.get('/admin/slot-blocks', ...requireAdmin, slotBlocks.listBlocks);
router.post('/admin/slot-blocks', ...requireAdmin, slotBlocks.blockValidators, validate, slotBlocks.createBlock);
router.delete('/admin/slot-blocks/:id', ...requireAdmin, slotBlocks.idParam, validate, slotBlocks.deleteBlock);
router.delete('/admin/slot-blocks', ...requireAdmin, slotBlocks.deleteByQueryValidators, validate, slotBlocks.deleteBlockByQuery);
router.get('/admin/customers', ...requireAdmin, customers.listCustomers);
router.get('/admin/customers/:id', ...requireAdmin, customers.getCustomer);

router.post('/admin/categories', ...requireAdmin, categories.categoryValidators, validate, categories.createCategory);
router.put('/admin/categories/:id', ...requireAdmin, categories.updateCategory);
router.delete('/admin/categories/:id', ...requireAdmin, categories.deleteCategory);

router.post('/admin/services', ...requireAdmin, services.serviceValidators, validate, services.createService);
router.put('/admin/services/:id', ...requireAdmin, services.updateService);
router.delete('/admin/services/:id', ...requireAdmin, services.deleteService);

router.get('/admin/staff', ...requireAdmin, staff.adminList);
router.post('/admin/staff', ...requireAdmin, staff.staffValidators, validate, staff.create);
router.put('/admin/staff/:id', ...requireAdmin, staff.idParam, validate, staff.update);
router.delete('/admin/staff/:id', ...requireAdmin, staff.idParam, validate, staff.remove);

router.post('/admin/packages', ...requireAdmin, packages.packageValidators, validate, packages.createPackage);
router.put('/admin/packages/:id', ...requireAdmin, packages.updatePackage);
router.delete('/admin/packages/:id', ...requireAdmin, packages.deletePackage);

router.post('/admin/banners', ...requireAdmin, banners.bannerValidators, validate, banners.createBanner);
router.put('/admin/banners/:id', ...requireAdmin, banners.updateBanner);
router.delete('/admin/banners/:id', ...requireAdmin, banners.deleteBanner);

router.get('/admin/discounts', ...requireAdmin, discounts.listDiscounts);
router.post('/admin/discounts', ...requireAdmin, discounts.discountValidators, validate, discounts.createDiscount);
router.put('/admin/discounts/:id', ...requireAdmin, discounts.updateDiscount);
router.delete('/admin/discounts/:id', ...requireAdmin, discounts.deleteDiscount);

router.patch('/admin/reviews/:id', ...requireAdmin, reviews.updateReviewVisibility);
router.delete('/admin/reviews/:id', ...requireAdmin, reviews.deleteReview);

router.post('/admin/uploads', ...requireAdmin, upload.single('image'), uploads.uploadImage);

export default router;
