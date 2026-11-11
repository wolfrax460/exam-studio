export function teacherEnrollmentScope(academic, membershipId) {
  const years = new Set(academic.years.filter(({ archived }) => !archived).map(({ id }) => id));
  const classes = academic.classes.filter(({ yearId }) => years.has(yearId));
  const classIds = new Set(classes.map(({ id }) => id));
  const wholeClasses = new Set(classes.filter(({ teacherId }) => teacherId === membershipId).map(({ id }) => id));
  const assignments = academic.assignments.filter(({ classId, teacherId }) => teacherId === membershipId && classIds.has(classId));
  for (const { classId, sectionId } of assignments) if (!sectionId) wholeClasses.add(classId);
  const sections = new Map();
  for (const { classId, sectionId } of assignments) {
    if (sectionId && !wholeClasses.has(classId)) sections.set(sectionId, { classId, sectionId });
  }
  return [...Array.from(wholeClasses, (classId) => ({ classId })), ...sections.values()];
}

export function canReadEnrollment(student, scope) {
  return !scope || (student.status === 'active' && scope.some(({ classId, sectionId }) =>
    student.classId === classId && (!sectionId || student.sectionId === sectionId)));
}
