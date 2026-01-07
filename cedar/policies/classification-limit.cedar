@id("classification-limit")
forbid(
  principal is Platform::Customer,
  action in [Platform::Action::"view", Platform::Action::"ask"],
  resource is Platform::Chunk
)
when {
  resource.classification == "confidential"
};