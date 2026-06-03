export function buildProjectUserGroups(users = [], projects = []) {
  const projectUsers = {};
  const unassignedUsers = [];

  for (const user of users) {
    const projectIds = Array.isArray(user.projectIds) && user.projectIds.length
      ? user.projectIds
      : user.projectId
        ? [user.projectId]
        : [];
    const validProjectIds = projectIds.filter((projectId) => projects.some((project) => project.id === projectId));
    if (!validProjectIds.length) {
      unassignedUsers.push(user);
      continue;
    }
    validProjectIds.forEach((projectId) => {
      if (!projectUsers[projectId]) projectUsers[projectId] = [];
      projectUsers[projectId].push(user);
    });
  }

  return { projectUsers, unassignedUsers };
}
