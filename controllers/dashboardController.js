import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/response.js';
import {
  getDashboardStats,
  getYearlyChart,
  getMonthlyDailyChart,
  getInProgressAppointments,
} from '../services/dashboardService.js';

export const stats = asyncHandler(async (req, res) => {
  ok(res, await getDashboardStats());
});

/** Annual chart: completed appointments + revenue by month */
export const chart = asyncHandler(async (req, res) => {
  ok(res, await getYearlyChart(req.query.year));
});

/** Monthly chart: completed appointments + revenue by day */
export const monthlyChart = asyncHandler(async (req, res) => {
  ok(res, await getMonthlyDailyChart(req.query.year, req.query.month));
});

export const inProgress = asyncHandler(async (req, res) => {
  ok(res, await getInProgressAppointments(req.query.limit));
});
