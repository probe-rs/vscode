# Publishing the probe-rs VS Code Extension

How the extension is published to the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=probe-rs.probe-rs-debugger) and [Open VSX Registry](https://open-vsx.org/extension/probe-rs/probe-rs-debugger), how to cut a release, and how to recover or recreate the pipeline if anything in the identity setup breaks.

## Cutting a release

1. Bump `version` in [package.json](package.json) (e.g. `0.26.0` → `0.26.1`). This is what `vsce` actually publishes — it reads the version from package.json, not from the git tag.
2. Commit and merge to `master`.
3. Create a new GitHub Release at <https://github.com/probe-rs/vscode/releases/new>:
   - **Tag**: `vX.Y.Z` matching the package.json version, prefixed with `v` (e.g. `v0.26.1`). Create the tag fresh from this page — don't push a tag separately.
   - **Target**: `master`. The tag will be created on `master` HEAD.
   - **Release notes**: written or auto-generated.
   - Click **Publish release** (not "Save draft" — drafts do not trigger the workflow).
4. The publish workflow ([.github/workflows/publish.yml](.github/workflows/publish.yml)) starts and pauses for approval in the `marketplace` environment. Approve in the [Actions tab](https://github.com/probe-rs/vscode/actions).
5. Two parallel jobs run: `publish-vsce` (VS Code Marketplace) and `publish-ovsx` (Open VSX). Each succeeds or fails independently — a transient failure in one does not block the other.
6. Verify both registries show the new version.

### Tag and version: who owns what

| Source of truth | What it determines |
| --- | --- |
| `version` in [package.json](package.json) | The version `vsce` and `ovsx` publish to the marketplaces. |
| Git tag `vX.Y.Z` on the release | The commit the workflow checks out and runs against. Also the rule the `marketplace` environment matches against to authorize the run. |

The two **must** match — there's no automation enforcing this today, so it's a manual discipline. The release tag is what the workflow runs from; the package.json version is what gets published. Mismatched values produce confusing failures (e.g. workflow runs from `v0.26.1` but publishes `0.26.0`).

## Architecture

### Trigger and gating

The workflow fires only on `release: published`. It does not run on push, PR, or schedule. When that event fires, the workflow's ref is the release's **tag** (e.g. `refs/tags/v0.26.1`), not a branch — this matters for the environment policy below.

Both jobs bind to the GitHub `marketplace` environment, which enforces:

- **Required reviewer** — a repo admin must manually approve each run.
- **Tag policy** — runs are only permitted from refs matching `v*`, which every release tag should match.

A publish never happens silently and never from an unauthorized ref.

### VS Code Marketplace authentication (OIDC, no PAT)

We use [Microsoft Entra federated credentials](https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation) instead of a long-lived Personal Access Token. The chain:

- Microsoft Entra tenant `probers.onmicrosoft.com` hosts an app registration `github-actions-vscode-publish`.
- The app has a federated credential trusting GitHub Actions OIDC tokens whose subject equals `repo:probe-rs/vscode:environment:marketplace`.
- The corresponding service principal is a **Contributor** member of the marketplace publisher `probe-rs`.
- During the publish job, [`azure/login@v3`](https://github.com/Azure/login) exchanges the GitHub OIDC token for an Azure access token. `vsce publish --azure-credential` then uses that token to call the marketplace API.

The workflow references only two non-secret identifiers — `AZURE_CLIENT_ID` and `AZURE_TENANT_ID` — stored as environment variables (not secrets) on the `marketplace` environment. **No marketplace credential is at rest in this repository.**

### Open VSX authentication (still PAT)

Open VSX has no OIDC equivalent. We use a token issued to the publisher account on <https://open-vsx.org>, stored as the environment secret `OPEN_VSX_MARKETPLACE_TOKEN`. Rotate it every ~12 months (see [Maintenance](#maintenance)).

### Local publishing (rare)

Day-to-day publishing should always go through the workflow. If you need to publish from a local machine in an emergency, use `npm run publish` after `vsce login probe-rs` with a personal PAT — the `--azure-credential` flag in CI is workflow-specific.

## Recreating the pipeline from scratch

Use this if the Entra tenant dies, ownership changes, or you fork into a new org.

### Prerequisites

- **Owner** on the marketplace publisher (<https://marketplace.visualstudio.com/manage/publishers/probe-rs>).
- **Admin** on the GitHub repo.
- A Microsoft Entra tenant where you can create app registrations. If you don't have one, sign up for any [Microsoft 365 Business plan](https://www.microsoft.com/microsoft-365/business) trial — the cheapest works, cancel before the trial ends. The Entra tenant survives forever; only the paid Office bits go away. Tenant creation through the Entra portal alone is gated for individuals — the Business signup flow is currently the only reliable path that doesn't require a paid Visual Studio subscription.

### 1. App registration

In <https://entra.microsoft.com> (signed in to the new tenant):

1. **Identity → Applications → App registrations → + New registration**.
   - Name: `github-actions-vscode-publish`
   - Supported account types: single tenant
   - Redirect URI: leave blank
2. From the resulting Overview page, save the **Application (client) ID** and **Directory (tenant) ID** GUIDs.

### 2. Federated credential (GitHub OIDC trust)

On the new app: **Manage → Certificates & secrets → Federated credentials → + Add credential**.

- Scenario: **GitHub Actions deploying Azure resources**
- Organization: `probe-rs`, Repository: `vscode`
- Entity type: **Environment**
- GitHub environment name: `marketplace` (must match exactly — case-sensitive)
- Audience: `api://AzureADTokenExchange` (default)
- Verify the Subject identifier auto-fills as `repo:probe-rs/vscode:environment:marketplace`.

### 3. Add the service principal to the marketplace publisher

The publisher Members page does **not** accept the SP's Application ID or Object ID — it requires the **Team Foundation Identity ID** from the Azure DevOps profile system. Bootstrap by calling the Profile API as the SP itself:

```bash
# In Entra → app → Certificates & secrets → Client secrets, create a temporary
# secret with the shortest expiry (7 days). Copy the value immediately.

az login --service-principal \
  -u <APPLICATION_CLIENT_ID> \
  -t <TENANT_ID> \
  -p '<TEMP_SECRET_VALUE>' \
  --allow-no-subscriptions

az rest -u https://app.vssps.visualstudio.com/_apis/profile/profiles/me \
  --resource 499b84ac-1321-427f-aa17-267ca6975798
```

Copy the `id` field from the JSON response. Then **immediately delete the temp client secret** in Entra and run `az logout`.

At <https://marketplace.visualstudio.com/manage/publishers/probe-rs> → **Members → + Add**: paste the `id` into the User Id field, role: **Contributor** (least privilege — Contributor can publish updates; Owner can also manage members and is unnecessary for automation).

### 4. GitHub environment + secrets/variables

In <https://github.com/probe-rs/vscode/settings/environments>:

1. Create environment named exactly `marketplace`.
2. **Required reviewers**: add at least one repo admin.
3. **Deployment branches and tags**: select "Selected branches and tags" and add a tag rule for `v*`. Do **not** add a branch rule like `master` — the workflow's ref will always be the release's tag, so a branch rule never matches and only adds confusion.
4. **Environment variables** (not secrets — these are non-sensitive identifiers):
   - `AZURE_CLIENT_ID` — Application (client) ID from step 1
   - `AZURE_TENANT_ID` — Directory (tenant) ID from step 1
5. **Environment secret**:
   - `OPEN_VSX_MARKETPLACE_TOKEN` — token issued at <https://open-vsx.org> → Settings → Access Tokens.

### 5. Verify

Cut a tagged pre-release on a throwaway version number, approve the workflow run, watch both jobs succeed, then unpublish the test version from both marketplaces.

## Maintenance

- **OVSX token**: rotate every ~12 months. Generate new token, update env secret, revoke old token.
- **Entra tenant heartbeat**: 200-day inactivity timer. Each release resets it; an idle period of 6+ months warrants a manual sign-in to <https://entra.microsoft.com>.
- **No PAT to rotate for VS Marketplace** — this is one of the main reasons for the OIDC setup. The federated credential lives indefinitely; nothing to expire.
