import { describe, expect, it } from 'vitest';
import { getDashboardGreetingFa } from './dashboardGreeting';
describe('dashboard greeting in organizational local time', () => {
  it.each([
    ['04:59','شبت بخیر'],['05:00','صبحت بخیر'],['10:59','صبحت بخیر'],
    ['11:00','ظهرت بخیر'],['13:59','ظهرت بخیر'],['14:00','عصرت بخیر'],
    ['17:59','عصرت بخیر'],['18:00','شبت بخیر'],['23:59','شبت بخیر'],
  ])('uses the correct greeting at %s', (time, greeting) => {
    expect(getDashboardGreetingFa(new Date(`2026-11-09T${time}:00+03:30`))).toBe(greeting);
  });
});
