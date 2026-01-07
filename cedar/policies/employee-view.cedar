@id("employee-view")
permit(
  principal is Platform::Employee,
  action in [Platform::Action::"view", Platform::Action::"ask"],
  resource is Platform::Chunk
)
when {
  principal.teams.contains(resource.employee_readers_team)
};