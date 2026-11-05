/**
 * Programme-length booking lock.
 *
 * A student who has been allocated a hostel room once cannot enter the random allocation again
 * for the rest of their programme (4 or 5 years, depending on the programme). The lock starts
 * with the academic year of their FIRST approved booking and covers `programmeYears` academic
 * years including that one.
 *
 * Example: first booking 2026/2027, 4-year programme -> locked for 2026/2027, 2027/2028,
 * 2028/2029 and 2029/2030; eligible again from 2030/2031.
 */
export const ALLOWED_PROGRAMME_YEARS = [4, 5] as const;
export type ProgrammeYears = (typeof ALLOWED_PROGRAMME_YEARS)[number];

export function isProgrammeYears(value: unknown): value is ProgrammeYears {
  return typeof value === "number" && (ALLOWED_PROGRAMME_YEARS as readonly number[]).includes(value);
}

/** Returns the first calendar year of an academic year such as "2026/2027", or null if malformed. */
export function academicYearStart(academicYear: string): number | null {
  const match = /^(\d{4})\/(\d{4})$/.exec(academicYear);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) return null;
  return Number(match[1]);
}

export type BookingLock =
  | { locked: false }
  | { locked: true; firstAcademicYear: string; lastLockedAcademicYear: string; nextEligibleAcademicYear: string };

export function formatAcademicYear(startYear: number) {
  return `${startYear}/${startYear + 1}`;
}

/**
 * @param firstApprovedAcademicYear academic year of the student's earliest approved booking (null if none)
 * @param programmeYears            4 or 5
 * @param currentAcademicYear      the academic year the booking window is currently open for
 */
export function evaluateBookingLock(
  firstApprovedAcademicYear: string | null,
  programmeYears: number,
  currentAcademicYear: string,
): BookingLock {
  if (!firstApprovedAcademicYear) return { locked: false };
  const first = academicYearStart(firstApprovedAcademicYear);
  const current = academicYearStart(currentAcademicYear);
  if (first === null || current === null) return { locked: false };
  const nextEligible = first + programmeYears;
  if (current >= nextEligible) return { locked: false };
  return {
    locked: true,
    firstAcademicYear: formatAcademicYear(first),
    lastLockedAcademicYear: formatAcademicYear(nextEligible - 1),
    nextEligibleAcademicYear: formatAcademicYear(nextEligible),
  };
}

export function bookingLockMessage(lock: Extract<BookingLock, { locked: true }>, programmeYears: number) {
  return `You were already allocated a hostel room in ${lock.firstAcademicYear}. Students are allocated once per ${programmeYears}-year programme, so you cannot book again until ${lock.nextEligibleAcademicYear}.`;
}
