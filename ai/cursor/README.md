# Cursor workflow for Cedar files (demo repo)

This repo’s demo depends on a small Cedar model under `cedar/`:

- `cedar/schema.cedarschema`
- `cedar/entities.json`
- `cedar/policies/*.cedar`

The `cedar/` directory structure already exists. Use the steps below to put the Cedar files in place in Cursor.

## How to add the Cedar files in Cursor

1. In the file tree, expand `cedar/` and confirm these paths exist:

   - `cedar/schema.cedarschema`
   - `cedar/entities.json`
   - `cedar/policies/`

2. If any of the files exist but are empty, open them and paste the corresponding contents from this README.

3. If a file does not exist, create it in Cursor at the path shown and paste the contents.

4. After pasting, save all files.

## Cedar model: multi-tenant collaboration platform

This model represents a platform used by multiple companies (**tenants**) to collaborate with their customers. People from different tenants must not see each other’s content. Access is granted via team-based sharing within a tenant.

- Tenants have teams.
- Documents belong to exactly one tenant.
- Customers can view documents shared with their customer reader team.
- Employees can view documents shared with their employee reader team.
- A simple classification field is included to demonstrate that policies can constrain access by sensitivity.

### 1) `cedar/schema.cedarschema`

```cedar
namespace Platform {
  entity Tenant;

  entity Team {
    tenant: Tenant,
  };

  // A person is either an Employee or a Customer.
  entity Employee {
    tenant: Tenant,
    teams: Set<Team>,
  };

  entity Customer {
    tenant: Tenant,
    teams: Set<Team>,
  };

  // Documents belong to a tenant and are shared via reader teams.
  entity Document {
    tenant: Tenant,

    // Reader teams may be null when a document is not shared with that category.
    employee_readers_team: Team?,
    customer_readers_team: Team?,

    // Simple sensitivity signal for the demo.
    classification: String,
  };

  // A chunk is the unit stored in the vector index.
  // It inherits tenant/sensitivity from the parent document.
  entity Chunk {
    tenant: Tenant,
    doc: Document,
    classification: String,

    // Flattened sharing attributes for easier pushdown filtering.
    employee_readers_team: Team?,
    customer_readers_team: Team?,
  };

  // Actions used by the demo.
  entity Action {
    // RAG retrieval / question answering.
    // Think: "use this chunk as context".
    ask: Action,

    // Traditional view action (kept for clarity in examples).
    view: Action,
  };
}
```

### 2) `cedar/policies/policy-tenant-scope.cedar`

This policy enforces the core rule: principals can only access resources in their own tenant.

```cedar
permit(
  principal,
  action,
  resource
)
when {
  // All principals in this demo have a tenant attribute.
  principal.tenant == resource.tenant
};
```

### 3) `cedar/policies/policy-customer-view.cedar`

Customers can view/ask using chunks shared with their customer reader team.

```cedar
permit(
  principal is Platform::Customer,
  action in [Platform::Action::"view", Platform::Action::"ask"],
  resource is Platform::Chunk
)
when {
  resource.customer_readers_team != null &&
  principal.teams.contains(resource.customer_readers_team)
};
```

### 4) `cedar/policies/policy-employee-view.cedar`

Employees can view/ask using chunks shared with their employee reader team.

```cedar
permit(
  principal is Platform::Employee,
  action in [Platform::Action::"view", Platform::Action::"ask"],
  resource is Platform::Chunk
)
when {
  resource.employee_readers_team != null &&
  principal.teams.contains(resource.employee_readers_team)
};
```

### 5) `cedar/policies/classification-limit.cedar`

Optional: demonstrate a simple sensitivity limit.

- Employees may access any classification.
- Customers may only access chunks whose classification is not `"confidential"`.

```cedar
forbid(
  principal is Platform::Customer,
  action in [Platform::Action::"view", Platform::Action::"ask"],
  resource is Platform::Chunk
)
when {
  resource.classification == "confidential"
};
```

### 6) `cedar/entities.json`

This provides two tenants with a few teams and people, plus one shared document represented as chunks.

```json
[
  {"uid": {"__entity": "Platform::Tenant", "id": "custco"}},
  {"uid": {"__entity": "Platform::Tenant", "id": "otherco"}},

  {"uid": {"__entity": "Platform::Team", "id": "custco-readers"},
   "attrs": {"tenant": {"__entity": "Platform::Tenant", "id": "custco"}}},
  {"uid": {"__entity": "Platform::Team", "id": "custco-employees"},
   "attrs": {"tenant": {"__entity": "Platform::Tenant", "id": "custco"}}},
  {"uid": {"__entity": "Platform::Team", "id": "otherco-readers"},
   "attrs": {"tenant": {"__entity": "Platform::Tenant", "id": "otherco"}}},

  {"uid": {"__entity": "Platform::Customer", "id": "kate"},
   "attrs": {
     "tenant": {"__entity": "Platform::Tenant", "id": "custco"},
     "teams": [
       {"__entity": "Platform::Team", "id": "custco-readers"}
     ]
   }},

  {"uid": {"__entity": "Platform::Customer", "id": "jack"},
   "attrs": {
     "tenant": {"__entity": "Platform::Tenant", "id": "custco"},
     "teams": [
       {"__entity": "Platform::Team", "id": "custco-readers"}
     ]
   }},

  {"uid": {"__entity": "Platform::Employee", "id": "alice"},
   "attrs": {
     "tenant": {"__entity": "Platform::Tenant", "id": "custco"},
     "teams": [
       {"__entity": "Platform::Team", "id": "custco-employees"}
     ]
   }},

  {"uid": {"__entity": "Platform::Customer", "id": "mallory"},
   "attrs": {
     "tenant": {"__entity": "Platform::Tenant", "id": "otherco"},
     "teams": [
       {"__entity": "Platform::Team", "id": "otherco-readers"}
     ]
   }},

  {"uid": {"__entity": "Platform::Document", "id": "q3-plan"},
   "attrs": {
     "tenant": {"__entity": "Platform::Tenant", "id": "custco"},
     "employee_readers_team": {"__entity": "Platform::Team", "id": "custco-employees"},
     "customer_readers_team": {"__entity": "Platform::Team", "id": "custco-readers"},
     "classification": "internal"
   }},

  {"uid": {"__entity": "Platform::Document", "id": "hr-note"},
   "attrs": {
     "tenant": {"__entity": "Platform::Tenant", "id": "custco"},
     "employee_readers_team": {"__entity": "Platform::Team", "id": "custco-employees"},
     "customer_readers_team": null,
     "classification": "confidential"
   }},

  {"uid": {"__entity": "Platform::Chunk", "id": "q3-plan#1"},
   "attrs": {
     "tenant": {"__entity": "Platform::Tenant", "id": "custco"},
     "doc": {"__entity": "Platform::Document", "id": "q3-plan"},
     "classification": "internal",
     "employee_readers_team": {"__entity": "Platform::Team", "id": "custco-employees"},
     "customer_readers_team": {"__entity": "Platform::Team", "id": "custco-readers"}
   }},

  {"uid": {"__entity": "Platform::Chunk", "id": "hr-note#1"},
   "attrs": {
     "tenant": {"__entity": "Platform::Tenant", "id": "custco"},
     "doc": {"__entity": "Platform::Document", "id": "hr-note"},
     "classification": "confidential",
     "employee_readers_team": {"__entity": "Platform::Team", "id": "custco-employees"},
     "customer_readers_team": null
   }}
]
```

## Quick sanity-check requests

These requests are useful for confirming the model behaves as expected.

### Customer can ask/view shared content

Kate can access chunks for `q3-plan` because she is in `custco-readers` and in the `custco` tenant.

```json
{
  "principal": "Platform::Customer::\"kate\"",
  "action": "Platform::Action::\"ask\"",
  "resource": "Platform::Chunk::\"q3-plan#1\""
}
```

### Customer cannot access confidential content

Kate is forbidden from accessing confidential chunks.

```json
{
  "principal": "Platform::Customer::\"kate\"",
  "action": "Platform::Action::\"ask\"",
  "resource": "Platform::Chunk::\"hr-note#1\""
}
```

### Cross-tenant access is denied

A customer from `otherco` cannot access `custco` resources.

```json
{
  "principal": "Platform::Customer::\"mallory\"",
  "action": "Platform::Action::\"ask\"",
  "resource": "Platform::Chunk::\"q3-plan#1\""
}
```

## Notes

- These Cedar files intentionally model *scope* using resource attributes (`tenant`, reader teams, and classification) because the goal of the demo is to show how partial evaluation can be used to derive retrieval-time constraints.
- Later parts of the repo will demonstrate producing a residual via Cedar TPE and compiling that residual into an OpenSearch metadata filter.
