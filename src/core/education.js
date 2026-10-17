// ============================================================================
// ABUJA LIFE: EDUCATION & ACADEMIC PROGRESSION CONTROLLER
// Enrollment, Lecture Attendance, Semester Exams & Graduation Buffs
// ============================================================================

import { COURSE_BY_ID } from '../data/education.js';

export function enrollInCourse(s, courseId) {
  const course = COURSE_BY_ID[courseId];
  if (!course) return { success: false, message: 'Institution or Course not found.' };

  const funds = (s.cash || 0) + (s.bank || 0);
  if (funds < course.tuition) {
    return {
      success: false,
      message: `Insufficient funds for ${course.title} tuition (₦${course.tuition.toLocaleString()}). You have ₦${funds.toLocaleString()}.`
    };
  }

  // Deduct tuition
  if (s.bank >= course.tuition) {
    s.bank -= course.tuition;
  } else {
    const diff = course.tuition - s.bank;
    s.bank = 0;
    s.cash -= diff;
  }

  if (!s.education) {
    s.education = { enrolledCourseId: null, progressDays: 0, completedDegrees: [] };
  }

  s.education.enrolledCourseId = courseId;
  s.education.progressDays = 0;
  s.education.lastLectureDay = s.clock?.day || 1;

  if (!s.social) s.social = {};
  s.social.steeze = Math.min(100, (s.social.steeze || 70) + 5);

  return {
    success: true,
    message: `Enrolled successfully in ${course.title} at ${course.institutionName}! Tuition of ₦${course.tuition.toLocaleString()} paid.`,
    course
  };
}

export function attendLecture(s) {
  if (!s.education || !s.education.enrolledCourseId) {
    return { success: false, message: 'You are not currently enrolled in any academic course.' };
  }

  const course = COURSE_BY_ID[s.education.enrolledCourseId];
  if (!course) return { success: false, message: 'Course record not found.' };

  // Study costs energy & time
  s.energy = Math.max(5, (s.energy || 80) - 18);
  s.education.progressDays = (s.education.progressDays || 0) + 1;

  const needed = course.durationDays;
  const current = s.education.progressDays;

  if (current >= needed) {
    // Graduate!
    if (!s.education.completedDegrees) s.education.completedDegrees = [];
    if (!s.education.completedDegrees.includes(course.id)) {
      s.education.completedDegrees.push(course.id);
    }
    s.education.enrolledCourseId = null;
    s.education.progressDays = 0;

    // Apply Graduation Rewards
    s.clout = Math.min(100, (s.clout || 20) + course.cloutBonus);
    s.social.steeze = Math.min(100, (s.social.steeze || 70) + course.steezeBonus);

    return {
      success: true,
      graduated: true,
      message: `🎓 CONGRATULATIONS! You have completed all semesters and graduated with ${course.title} from ${course.institutionName}! +${course.cloutBonus} Clout, +${course.steezeBonus} Steeze! All Level ${course.promotionReqLevel}+ career opportunities unlocked!`
    };
  }

  return {
    success: true,
    graduated: false,
    message: `Attended 3-Hour Intensive Lecture at ${course.institutionName}. Semester Progress: ${current}/${needed} Modules Completed.`
  };
}
