permit(
  principal is Platform::Employee,
  action in [Platform::Action::"view", Platform::Action::"ask"],
  resource is Platform::Chunk
)
when {
  resource.employee_readers_team != null &&
  principal.teams.contains(resource.employee_readers_team)
};