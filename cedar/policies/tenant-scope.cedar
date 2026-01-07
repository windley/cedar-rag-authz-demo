@id("tenant-scope")
permit(
  principal,
  action,
  resource
)
when {
  // All principals in this demo have a tenant attribute.
  principal.tenant == resource.tenant
};
