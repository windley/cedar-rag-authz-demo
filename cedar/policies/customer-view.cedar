permit(
  principal is Platform::Customer,
  action in [Platform::Action::"view", Platform::Action::"ask"],
  resource is Platform::Chunk
)
when {
  resource.customer_readers_team != null &&
  principal.teams.contains(resource.customer_readers_team)
};

