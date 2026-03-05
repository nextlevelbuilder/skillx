UPDATE skills SET content = '---
name: snowflake-semanticview
description: Create, alter, and validate Snowflake semantic views using Snowflake CLI (snow). Use when asked to build or troubleshoot semantic views/semantic layer definitions with CREATE/ALTER SEMANTIC VIEW, to validate semantic-view DDL against Snowflake via CLI, or to guide Snowflake CLI installation and connection setup.
---

# Snowflake Semantic Views

## One-Time Setup

- Verify Snowflake CLI installation by opening a new terminal and running `snow --help`.
- If Snowflake CLI is missing or the user cannot install it, direct them to https://docs.snowflake.com/en/developer-guide/snowflake-cli/installation/installation.
- Configure a Snowflake connection with `snow connection add` per https://docs.snowflake.com/en/developer-guide/snowflake-cli/connecting/configure-connections#add-a-connection.
- Use the configured connection for all validation and execution steps.

## Workflow For Each Semantic View Request

1. Confirm the target database, schema, role, warehouse, and final semantic view name.
2. Confirm the model follows a star schema (facts with conformed dimensions).
3. Draft the semantic view DDL using the official syntax:
   - https://docs.snowflake.com/en/sql-reference/sql/create-semantic-view
4. Populate synonyms and comments for each dimension, fact, and metric:
   - Read Snowflake table/view/column comments first (preferred source):
     - https://docs.snowflake.com/en/sql-reference/sql/comment
   - If comments or synonyms are missing, ask whether you can create them, whether the user wants to provide text, or whether you should draft suggestions for approval.
5. Use SELECT statements with DISTINCT and LIMIT (maximum 1000 rows) to discover relationships between fact and dimension tables, identify column data types, and create more meaningful comments and synonyms for columns.
6. Create a temporary validation name (for example, append `__tmp_validate`) while keeping the same database and schema.
7. Always validate by sending the DDL to Snowflake via Snowflake CLI before finalizing:
   - Use `snow sql` to execute the statement with the configured connection.
   - If flags differ by version, check `snow sql --help` and use the connection option shown there.
8. If validation fails, iterate on the DDL and re-run the validation step until it succeeds.
9. Apply the final DDL (create or alter) using the real semantic view name.
10. Run a sample query against the final semantic view to confirm it works as expected. It has a different SQL syntax as can be seen here: https://docs.snowflake.com/en/user-guide/views-semantic/querying#querying-a-semantic-view
Example:

```SQL
SELECT * FROM SEMANTIC_VIEW(
    my_semview_name
    DIMENSIONS customer.customer_market_segment
    METRICS orders.order_average_value
)
ORDER BY customer_market_segment;
```

11. Clean up any temporary semantic view created during validation.

## Synonyms And Comments (Required)

- Use the semantic view syntax for synonyms and comments:

```
WITH SYNONYMS [ = ] ( ''synonym'' [ , ... ] )
COMMENT = ''comment_about_dim_fact_or_metric''
```

- Treat synonyms as informational only; do not use them to reference dimensions, facts, or metrics elsewhere.
- Use Snowflake comments as the preferred and first source for synonyms and comments:
  - https://docs.snowflake.com/en/sql-reference/sql/comment
- If Snowflake comments are missing, ask whether you can create them, whether the user wants to provide text, or whether you should draft suggestions for approval.
- Do not invent synonyms or comments without user approval.

## Validation Pattern (Required)

- Never skip validation. Always execute the DDL against Snowflake with Snowflake CLI before presenting it as final.
- Prefer a temporary name for validation to avoid clobbering the real view.

## Example CLI Validation (Template)

```bash
# Replace placeholders with real values.
snow sql -q "<CREATE OR ALTER SEMANTIC VIEW ...>" --connection <connection_name>
```

If the CLI uses a different connection flag in your version, run:

```bash
snow sql --help
```

## Notes

- Treat installation and connection setup as one-time steps, but confirm they are done before the first validation.
- Keep the final semantic view definition identical to the validated temporary definition except for the name.
- Do not omit synonyms or comments; consider them required for completeness even if optional in syntax.
' WHERE slug = 'github-snowflake-semanticview';
UPDATE skills SET content = '---
name: azure-static-web-apps
description: Helps create, configure, and deploy Azure Static Web Apps using the SWA CLI. Use when deploying static sites to Azure, setting up SWA local development, configuring staticwebapp.config.json, adding Azure Functions APIs to SWA, or setting up GitHub Actions CI/CD for Static Web Apps.
---

## Overview

Azure Static Web Apps (SWA) hosts static frontends with optional serverless API backends. The SWA CLI (`swa`) provides local development emulation and deployment capabilities.

**Key features:**
- Local emulator with API proxy and auth simulation
- Framework auto-detection and configuration
- Direct deployment to Azure
- Database connections support

**Config files:**
- `swa-cli.config.json` - CLI settings, **created by `swa init`** (never create manually)
- `staticwebapp.config.json` - Runtime config (routes, auth, headers, API runtime) - can be created manually

## General Instructions

### Installation

```bash
npm install -D @azure/static-web-apps-cli
```

Verify: `npx swa --version`

### Quick Start Workflow

**IMPORTANT: Always use `swa init` to create configuration files. Never manually create `swa-cli.config.json`.**

1. `swa init` - **Required first step** - auto-detects framework and creates `swa-cli.config.json`
2. `swa start` - Run local emulator at `http://localhost:4280`
3. `swa login` - Authenticate with Azure
4. `swa deploy` - Deploy to Azure

### Configuration Files

**swa-cli.config.json** - Created by `swa init`, do not create manually:
- Run `swa init` for interactive setup with framework detection
- Run `swa init --yes` to accept auto-detected defaults
- Edit the generated file only to customize settings after initialization

Example of generated config (for reference only):
```json
{
  "$schema": "https://aka.ms/azure/static-web-apps-cli/schema",
  "configurations": {
    "app": {
      "appLocation": ".",
      "apiLocation": "api",
      "outputLocation": "dist",
      "appBuildCommand": "npm run build",
      "run": "npm run dev",
      "appDevserverUrl": "http://localhost:3000"
    }
  }
}
```

**staticwebapp.config.json** (in app source or output folder) - This file CAN be created manually for runtime configuration:
```json
{
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": ["/images/*", "/css/*"]
  },
  "routes": [
    { "route": "/api/*", "allowedRoles": ["authenticated"] }
  ],
  "platform": {
    "apiRuntime": "node:20"
  }
}
```

## Command-line Reference

### swa login

Authenticate with Azure for deployment.

```bash
swa login                              # Interactive login
swa login --subscription-id <id>       # Specific subscription
swa login --clear-credentials          # Clear cached credentials
```

**Flags:** `--subscription-id, -S` | `--resource-group, -R` | `--tenant-id, -T` | `--client-id, -C` | `--client-secret, -CS` | `--app-name, -n`

### swa init

Configure a new SWA project based on an existing frontend and (optional) API. Detects frameworks automatically.

```bash
swa init                    # Interactive setup
swa init --yes              # Accept defaults
```

### swa build

Build frontend and/or API.

```bash
swa build                   # Build using config
swa build --auto            # Auto-detect and build
swa build myApp             # Build specific configuration
```

**Flags:** `--app-location, -a` | `--api-location, -i` | `--output-location, -O` | `--app-build-command, -A` | `--api-build-command, -I`

### swa start

Start local development emulator.

```bash
swa start                                    # Serve from outputLocation
swa start ./dist                             # Serve specific folder
swa start http://localhost:3000              # Proxy to dev server
swa start ./dist --api-location ./api        # With API folder
swa start http://localhost:3000 --run "npm start"  # Auto-start dev server
```

**Common framework ports:**
| Framework | Port |
|-----------|------|
| React/Vue/Next.js | 3000 |
| Angular | 4200 |
| Vite | 5173 |

**Key flags:**
- `--port, -p` - Emulator port (default: 4280)
- `--api-location, -i` - API folder path
- `--api-port, -j` - API port (default: 7071)
- `--run, -r` - Command to start dev server
- `--open, -o` - Open browser automatically
- `--ssl, -s` - Enable HTTPS

### swa deploy

Deploy to Azure Static Web Apps.

```bash
swa deploy                              # Deploy using config
swa deploy ./dist                       # Deploy specific folder
swa deploy --env production             # Deploy to production
swa deploy --deployment-token <TOKEN>   # Use deployment token
swa deploy --dry-run                    # Preview without deploying
```

**Get deployment token:**
- Azure Portal: Static Web App → Overview → Manage deployment token
- CLI: `swa deploy --print-token`
- Environment variable: `SWA_CLI_DEPLOYMENT_TOKEN`

**Key flags:**
- `--env` - Target environment (`preview` or `production`)
- `--deployment-token, -d` - Deployment token
- `--app-name, -n` - Azure SWA resource name

### swa db

Initialize database connections.

```bash
swa db init --database-type mssql
swa db init --database-type postgresql
swa db init --database-type cosmosdb_nosql
```

## Scenarios

### Create SWA from Existing Frontend and Backend

**Always run `swa init` before `swa start` or `swa deploy`. Do not manually create `swa-cli.config.json`.**

```bash
# 1. Install CLI
npm install -D @azure/static-web-apps-cli

# 2. Initialize - REQUIRED: creates swa-cli.config.json with auto-detected settings
npx swa init              # Interactive mode
# OR
npx swa init --yes        # Accept auto-detected defaults

# 3. Build application (if needed)
npm run build

# 4. Test locally (uses settings from swa-cli.config.json)
npx swa start

# 5. Deploy
npx swa login
npx swa deploy --env production
```

### Add Azure Functions Backend

1. **Create API folder:**
```bash
mkdir api && cd api
func init --worker-runtime node --model V4
func new --name message --template "HTTP trigger"
```

2. **Example function** (`api/src/functions/message.js`):
```javascript
const { app } = require(''@azure/functions'');

app.http(''message'', {
    methods: [''GET'', ''POST''],
    authLevel: ''anonymous'',
    handler: async (request) => {
        const name = request.query.get(''name'') || ''World'';
        return { jsonBody: { message: `Hello, ${name}!` } };
    }
});
```

3. **Set API runtime** in `staticwebapp.config.json`:
```json
{
  "platform": { "apiRuntime": "node:20" }
}
```

4. **Update CLI config** in `swa-cli.config.json`:
```json
{
  "configurations": {
    "app": { "apiLocation": "api" }
  }
}
```

5. **Test locally:**
```bash
npx swa start ./dist --api-location ./api
# Access API at http://localhost:4280/api/message
```

**Supported API runtimes:** `node:18`, `node:20`, `node:22`, `dotnet:8.0`, `dotnet-isolated:8.0`, `python:3.10`, `python:3.11`

### Set Up GitHub Actions Deployment

1. **Create SWA resource** in Azure Portal or via Azure CLI
2. **Link GitHub repository** - workflow auto-generated, or create manually:

`.github/workflows/azure-static-web-apps.yml`:
```yaml
name: Azure Static Web Apps CI/CD

on:
  push:
    branches: [main]
  pull_request:
    types: [opened, synchronize, reopened, closed]
    branches: [main]

jobs:
  build_and_deploy:
    if: github.event_name == ''push'' || (github.event_name == ''pull_request'' && github.event.action != ''closed'')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build And Deploy
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
          repo_token: ${{ secrets.GITHUB_TOKEN }}
          action: upload
          app_location: /
          api_location: api
          output_location: dist

  close_pr:
    if: github.event_name == ''pull_request'' && github.event.action == ''closed''
    runs-on: ubuntu-latest
    steps:
      - uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
          action: close
```

3. **Add secret:** Copy deployment token to repository secret `AZURE_STATIC_WEB_APPS_API_TOKEN`

**Workflow settings:**
- `app_location` - Frontend source path
- `api_location` - API source path
- `output_location` - Built output folder
- `skip_app_build: true` - Skip if pre-built
- `app_build_command` - Custom build command

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 404 on client routes | Add `navigationFallback` with `rewrite: "/index.html"` to `staticwebapp.config.json` |
| API returns 404 | Verify `api` folder structure, ensure `platform.apiRuntime` is set, check function exports |
| Build output not found | Verify `output_location` matches actual build output directory |
| Auth not working locally | Use `/.auth/login/<provider>` to access auth emulator UI |
| CORS errors | APIs under `/api/*` are same-origin; external APIs need CORS headers |
| Deployment token expired | Regenerate in Azure Portal → Static Web App → Manage deployment token |
| Config not applied | Ensure `staticwebapp.config.json` is in `app_location` or `output_location` |
| Local API timeout | Default is 45 seconds; optimize function or check for blocking calls |

**Debug commands:**
```bash
swa start --verbose log        # Verbose output
swa deploy --dry-run           # Preview deployment
swa --print-config             # Show resolved configuration
```
' WHERE slug = 'github-azure-static-web-apps';
UPDATE skills SET content = '---
name: terraform-azurerm-set-diff-analyzer
description: Analyze Terraform plan JSON output for AzureRM Provider to distinguish between false-positive diffs (order-only changes in Set-type attributes) and actual resource changes. Use when reviewing terraform plan output for Azure resources like Application Gateway, Load Balancer, Firewall, Front Door, NSG, and other resources with Set-type attributes that cause spurious diffs due to internal ordering changes.
license: MIT
---

# Terraform AzureRM Set Diff Analyzer

A skill to identify "false-positive diffs" in Terraform plans caused by AzureRM Provider''s Set-type attributes and distinguish them from actual changes.

## When to Use

- `terraform plan` shows many changes, but you only added/removed a single element
- Application Gateway, Load Balancer, NSG, etc. show "all elements changed"
- You want to automatically filter false-positive diffs in CI/CD

## Background

Terraform''s Set type compares by position rather than by key, so when adding or removing elements, all elements appear as "changed". This is a general Terraform issue, but it''s particularly noticeable with AzureRM resources that heavily use Set-type attributes like Application Gateway, Load Balancer, and NSG.

These "false-positive diffs" don''t actually affect the resources, but they make reviewing terraform plan output difficult.

## Prerequisites

- Python 3.8+

If Python is unavailable, install via your package manager (e.g., `apt install python3`, `brew install python3`) or from [python.org](https://www.python.org/downloads/).

## Basic Usage

```bash
# 1. Generate plan JSON output
terraform plan -out=plan.tfplan
terraform show -json plan.tfplan > plan.json

# 2. Analyze
python scripts/analyze_plan.py plan.json
```

## Troubleshooting

- **`python: command not found`**: Use `python3` instead, or install Python
- **`ModuleNotFoundError`**: Script uses only standard library; ensure Python 3.8+

## Detailed Documentation

- [scripts/README.md](scripts/README.md) - All options, output formats, exit codes, CI/CD examples
- [references/azurerm_set_attributes.md](references/azurerm_set_attributes.md) - Supported resources and attributes
' WHERE slug = 'github-terraform-azurerm-set-diff-analyzer';
UPDATE skills SET content = '---
name: make-repo-contribution
description: ''All changes to code must follow the guidance documented in the repository. Before any issue is filed, branch is made, commits generated, or pull request (or PR) created, a search must be done to ensure the right steps are followed. Whenever asked to create an issue, commit messages, to push code, or create a PR, use this skill so everything is done correctly.''
---

# Contribution guidelines

Most every project has a set of contribution guidelines everyone needs to follow when creating issues, pull requests (PR), or otherwise contributing code. These may include, but are not limited to:

- Creating an issue before creating a PR, or creating the two in conjunction
- Templates for issues or PRs that must be used depending on the change request being made
- Guidelines on what needs to be documented in those issues and PRs
- Tests, linters, and other prerequisites that need to be run before pushing any changes

Always remember, you are a guest in someone else''s repository. As such, you need to follow the rules and guidelines set forth by the repository owner when contributing code.

## Using existing guidelines

Before creating a PR or any of the steps leading up to it, explore the project to determine if there''s any guidance. Places to explore include, but are not limited to:

- README.md
- CONTRIBUTING.md
- Project documentation
- Issue templates
- Pull request or PR templates

If any of those exist or you discover documentation elsewhere in the repo, read through what you find, consider it, and follow the guidance to the best of your ability. If you have any questions or confusion, ask the user for input on how best to proceed. DO NOT create a PR until you''re certain you''ve followed the practices.

## No guidelines found

If no guidance is found, or doesn''t provide guidance on certain topics, then use the following as a foundation for creating a quality contribution. **ALWAYS** defer to the guidance provided in the repository.

## Tasks

Many repository owners will have guidance on prerequisite steps which need to be completed before a PR is to be created. This can include, but is not limited to:

- building the project or generating assets
- running linters and ensuring any issues are resolved
- naming guidelines and other patterns
- unit tests, end to end tests, or other tests which need to be created and pass
  - related, there may be required coverage percentages

Look through all guidance you find, and ensure any prerequisites have been satisfied.

## Issue

Always start by looking to see if an issue exists that''s related to the task at hand. This may have already been created by the user, or someone else. If you discover one, prompt the user to ensure they want to use that issue, or which one they may wish to use.

If no issue is discovered, look through the guidance to see if creating an issue is a requirement. If it is, use the template provided in the repository. If there are multiple, choose the one that most aligns with the work being done. If there are any questions, ask the user which one to use.

If the requirement is to file an issue, but no issue template is provided, use [this issue template](./assets/issue-template.md) as a guide on what to file.

## Branch

Before performing any commits, ensure a branch has been created for the work. Follow whatever guidance is provided by the repository''s documentation. If prefixes are defined, like `feature` or `chore`, or if the requirement is to use the username of the person making the PR, then use that. This branch must never be `main`, or the default branch, but should be a branch created specifically for the changes taking place. If no branch is already created, create a new one with a good name based on the changes being made and the guidance.

## Commits

When committing changes:

1. Review all changes
2. Logically group the changes together
3. Create short commit messages for each group, following any guidance in the repository
4. Commit the grouped code to the branch.

## Merging

**NEVER** merge to main unless explicitly instructed to do so by the user

## Pull request

When creating a pull request, use existing templates in the repository if any exist, following the guidance you discovered.

If no template is provided, use the [this PR template](./assets/pr-template.md). It contains a collection of headers to use, each with guidance of what to place in the particular sections.

If an issue was created or is being used, ensure that issue is referenced in the PR. Use the `Closes #NUMBER` syntax to enable auto-closing of the issue.
' WHERE slug = 'github-make-repo-contribution';
UPDATE skills SET content = '---
name: microsoft-code-reference
description: Look up Microsoft API references, find working code samples, and verify SDK code is correct. Use when working with Azure SDKs, .NET libraries, or Microsoft APIs—to find the right method, check parameters, get working examples, or troubleshoot errors. Catches hallucinated methods, wrong signatures, and deprecated patterns by querying official docs.
compatibility: Requires Microsoft Learn MCP Server (https://learn.microsoft.com/api/mcp)
---

# Microsoft Code Reference

## Tools

| Need | Tool | Example |
|------|------|---------|
| API method/class lookup | `microsoft_docs_search` | `"BlobClient UploadAsync Azure.Storage.Blobs"` |
| Working code sample | `microsoft_code_sample_search` | `query: "upload blob managed identity", language: "python"` |
| Full API reference | `microsoft_docs_fetch` | Fetch URL from `microsoft_docs_search` (for overloads, full signatures) |

## Finding Code Samples

Use `microsoft_code_sample_search` to get official, working examples:

```
microsoft_code_sample_search(query: "upload file to blob storage", language: "csharp")
microsoft_code_sample_search(query: "authenticate with managed identity", language: "python")
microsoft_code_sample_search(query: "send message service bus", language: "javascript")
```

**When to use:**
- Before writing code—find a working pattern to follow
- After errors—compare your code against a known-good sample
- Unsure of initialization/setup—samples show complete context

## API Lookups

```
# Verify method exists (include namespace for precision)
"BlobClient UploadAsync Azure.Storage.Blobs"
"GraphServiceClient Users Microsoft.Graph"

# Find class/interface
"DefaultAzureCredential class Azure.Identity"

# Find correct package
"Azure Blob Storage NuGet package"
"azure-storage-blob pip package"
```

Fetch full page when method has multiple overloads or you need complete parameter details.

## Error Troubleshooting

Use `microsoft_code_sample_search` to find working code samples and compare with your implementation. For specific errors, use `microsoft_docs_search` and `microsoft_docs_fetch`:

| Error Type | Query |
|------------|-------|
| Method not found | `"[ClassName] methods [Namespace]"` |
| Type not found | `"[TypeName] NuGet package namespace"` |
| Wrong signature | `"[ClassName] [MethodName] overloads"` → fetch full page |
| Deprecated warning | `"[OldType] migration v12"` |
| Auth failure | `"DefaultAzureCredential troubleshooting"` |
| 403 Forbidden | `"[ServiceName] RBAC permissions"` |

## When to Verify

Always verify when:
- Method name seems "too convenient" (`UploadFile` vs actual `Upload`)
- Mixing SDK versions (v11 `CloudBlobClient` vs v12 `BlobServiceClient`)
- Package name doesn''t follow conventions (`Azure.*` for .NET, `azure-*` for Python)
- Using an API for the first time

## Validation Workflow

Before generating code using Microsoft SDKs, verify it''s correct:

1. **Confirm method or package exists** — `microsoft_docs_search(query: "[ClassName] [MethodName] [Namespace]")`
2. **Fetch full details** (for overloads/complex params) — `microsoft_docs_fetch(url: "...")`
3. **Find working sample** — `microsoft_code_sample_search(query: "[task]", language: "[lang]")`

For simple lookups, step 1 alone may suffice. For complex API usage, complete all three steps.
' WHERE slug = 'github-microsoft-code-reference';
UPDATE skills SET content = '---
name: appinsights-instrumentation
description: ''Instrument a webapp to send useful telemetry data to Azure App Insights''
---

# AppInsights instrumentation

This skill enables sending telemetry data of a webapp to Azure App Insights for better observability of the app''s health.

## When to use this skill

Use this skill when the user wants to enable telemetry for their webapp.

## Prerequisites

The app in the workspace must be one of these kinds

- An ASP.NET Core app hosted in Azure
- A Node.js app hosted in Azure

## Guidelines

### Collect context information

Find out the (programming language, application framework, hosting) tuple of the application the user is trying to add telemetry support in. This determines how the application can be instrumented. Read the source code to make an educated guess. Confirm with the user on anything you don''t know. You must always ask the user where the application is hosted (e.g. on a personal computer, in an Azure App Service as code, in an Azure App Service as container, in an Azure Container App, etc.). 

### Prefer auto-instrument if possible

If the app is a C# ASP.NET Core app hosted in Azure App Service, use [AUTO guide](references/AUTO.md) to help user auto-instrument the app.

### Manually instrument

Manually instrument the app by creating the AppInsights resource and update the app''s code. 

#### Create AppInsights resource

Use one of the following options that fits the environment.

- Add AppInsights to existing Bicep template. See [examples/appinsights.bicep](examples/appinsights.bicep) for what to add. This is the best option if there are existing Bicep template files in the workspace.
- Use Azure CLI. See [scripts/appinsights.ps1](scripts/appinsights.ps1) for what Azure CLI command to execute to create the App Insights resource.

No matter which option you choose, recommend the user to create the App Insights resource in a meaningful resource group that makes managing resources easier. A good candidate will be the same resource group that contains the resources for the hosted app in Azure.

#### Modify application code

- If the app is an ASP.NET Core app, see [ASPNETCORE guide](references/ASPNETCORE.md) for how to modify the C# code.
- If the app is a Node.js app, see [NODEJS guide](references/NODEJS.md) for how to modify the JavaScript/TypeScript code.
- If the app is a Python app, see [PYTHON guide](references/PYTHON.md) for how to modify the Python code.
' WHERE slug = 'github-appinsights-instrumentation';
UPDATE skills SET content = '---
name: image-manipulation-image-magick
description: Process and manipulate images using ImageMagick. Supports resizing, format conversion, batch processing, and retrieving image metadata. Use when working with images, creating thumbnails, resizing wallpapers, or performing batch image operations.
compatibility: Requires ImageMagick installed and available as `magick` on PATH. Cross-platform examples provided for PowerShell (Windows) and Bash (Linux/macOS).
---

# Image Manipulation with ImageMagick

This skill enables image processing and manipulation tasks using ImageMagick
across Windows, Linux, and macOS systems.

## When to Use This Skill

Use this skill when you need to:

- Resize images (single or batch)
- Get image dimensions and metadata
- Convert between image formats
- Create thumbnails
- Process wallpapers for different screen sizes
- Batch process multiple images with specific criteria

## Prerequisites

- ImageMagick installed on the system
- **Windows**: PowerShell with ImageMagick available as `magick` (or at `C:\Program Files\ImageMagick-*\magick.exe`)
- **Linux/macOS**: Bash with ImageMagick installed via package manager (`apt`, `brew`, etc.)

## Core Capabilities

### 1. Image Information

- Get image dimensions (width x height)
- Retrieve detailed metadata (format, color space, etc.)
- Identify image format

### 2. Image Resizing

- Resize single images
- Batch resize multiple images
- Create thumbnails with specific dimensions
- Maintain aspect ratios

### 3. Batch Processing

- Process images based on dimensions
- Filter and process specific file types
- Apply transformations to multiple files

## Usage Examples

### Example 0: Resolve `magick` executable

**PowerShell (Windows):**
```powershell
# Prefer ImageMagick on PATH
$magick = (Get-Command magick -ErrorAction SilentlyContinue)?.Source

# Fallback: common install pattern under Program Files
if (-not $magick) {
    $magick = Get-ChildItem "C:\\Program Files\\ImageMagick-*\\magick.exe" -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty FullName
}

if (-not $magick) {
    throw "ImageMagick not found. Install it and/or add ''magick'' to PATH."
}
```

**Bash (Linux/macOS):**
```bash
# Check if magick is available on PATH
if ! command -v magick &> /dev/null; then
    echo "ImageMagick not found. Install it using your package manager:"
    echo "  Ubuntu/Debian: sudo apt install imagemagick"
    echo "  macOS: brew install imagemagick"
    exit 1
fi
```

### Example 1: Get Image Dimensions

**PowerShell (Windows):**
```powershell
# For a single image
& $magick identify -format "%wx%h" path/to/image.jpg

# For multiple images
Get-ChildItem "path/to/images/*" | ForEach-Object { 
    $dimensions = & $magick identify -format "%f: %wx%h`n" $_.FullName
    Write-Host $dimensions 
}
```

**Bash (Linux/macOS):**
```bash
# For a single image
magick identify -format "%wx%h" path/to/image.jpg

# For multiple images
for img in path/to/images/*; do
    magick identify -format "%f: %wx%h\n" "$img"
done
```

### Example 2: Resize Images

**PowerShell (Windows):**
```powershell
# Resize a single image
& $magick input.jpg -resize 427x240 output.jpg

# Batch resize images
Get-ChildItem "path/to/images/*" | ForEach-Object { 
    & $magick $_.FullName -resize 427x240 "path/to/output/thumb_$($_.Name)"
}
```

**Bash (Linux/macOS):**
```bash
# Resize a single image
magick input.jpg -resize 427x240 output.jpg

# Batch resize images
for img in path/to/images/*; do
    filename=$(basename "$img")
    magick "$img" -resize 427x240 "path/to/output/thumb_$filename"
done
```

### Example 3: Get Detailed Image Information

**PowerShell (Windows):**
```powershell
# Get verbose information about an image
& $magick identify -verbose path/to/image.jpg
```

**Bash (Linux/macOS):**
```bash
# Get verbose information about an image
magick identify -verbose path/to/image.jpg
```

### Example 4: Process Images Based on Dimensions

**PowerShell (Windows):**
```powershell
Get-ChildItem "path/to/images/*" | ForEach-Object { 
    $dimensions = & $magick identify -format "%w,%h" $_.FullName
    if ($dimensions) {
        $width,$height = $dimensions -split '',''
        if ([int]$width -eq 2560 -or [int]$height -eq 1440) {
            Write-Host "Processing $($_.Name)"
            & $magick $_.FullName -resize 427x240 "path/to/output/thumb_$($_.Name)"
        }
    }
}
```

**Bash (Linux/macOS):**
```bash
for img in path/to/images/*; do
    dimensions=$(magick identify -format "%w,%h" "$img")
    if [[ -n "$dimensions" ]]; then
        width=$(echo "$dimensions" | cut -d'','' -f1)
        height=$(echo "$dimensions" | cut -d'','' -f2)
        if [[ "$width" -eq 2560 || "$height" -eq 1440 ]]; then
            filename=$(basename "$img")
            echo "Processing $filename"
            magick "$img" -resize 427x240 "path/to/output/thumb_$filename"
        fi
    fi
done
```

## Guidelines

1. **Always quote file paths** - Use quotes around file paths that might contain spaces
2. **Use the `&` operator (PowerShell)** - Invoke the magick executable using `&` in PowerShell
3. **Store the path in a variable (PowerShell)** - Assign the ImageMagick path to `$magick` for cleaner code
4. **Wrap in loops** - When processing multiple files, use `ForEach-Object` (PowerShell) or `for` loops (Bash)
5. **Verify dimensions first** - Check image dimensions before processing to avoid unnecessary operations
6. **Use appropriate resize flags** - Consider using `!` to force exact dimensions or `^` for minimum dimensions

## Common Patterns

### PowerShell Patterns

#### Pattern: Store ImageMagick Path

```powershell
$magick = (Get-Command magick).Source
```

#### Pattern: Get Dimensions as Variables

```powershell
$dimensions = & $magick identify -format "%w,%h" $_.FullName
$width,$height = $dimensions -split '',''
```

#### Pattern: Conditional Processing

```powershell
if ([int]$width -gt 1920) {
    & $magick $_.FullName -resize 1920x1080 $outputPath
}
```

#### Pattern: Create Thumbnails

```powershell
& $magick $_.FullName -resize 427x240 "thumbnails/thumb_$($_.Name)"
```

### Bash Patterns

#### Pattern: Check ImageMagick Installation

```bash
command -v magick &> /dev/null || { echo "ImageMagick required"; exit 1; }
```

#### Pattern: Get Dimensions as Variables

```bash
dimensions=$(magick identify -format "%w,%h" "$img")
width=$(echo "$dimensions" | cut -d'','' -f1)
height=$(echo "$dimensions" | cut -d'','' -f2)
```

#### Pattern: Conditional Processing

```bash
if [[ "$width" -gt 1920 ]]; then
    magick "$img" -resize 1920x1080 "$outputPath"
fi
```

#### Pattern: Create Thumbnails

```bash
filename=$(basename "$img")
magick "$img" -resize 427x240 "thumbnails/thumb_$filename"
```

## Limitations

- Large batch operations may be memory-intensive
- Some complex operations may require additional ImageMagick delegates
- On older Linux systems, use `convert` instead of `magick` (ImageMagick 6.x vs 7.x)
' WHERE slug = 'github-image-manipulation-image-magick';
UPDATE skills SET content = '---
name: meeting-minutes
description: ''Generate concise, actionable meeting minutes for internal meetings. Includes metadata, attendees, agenda, decisions, action items (owner + due date), and follow-up steps.''
---

# Meeting Minutes Skill — Short Internal Meetings

## Purpose / Overview

This Skill produces high-quality, consistent meeting minutes for internal meetings that are 60 minutes or shorter. Output is designed to be clear, actionable, and easy to convert into task trackers (e.g., GitHub Issues, Jira). The generated minutes prioritize decisions and action items so teams can move quickly from discussion to execution.

## When to Use

Use this skill when:

- Internal syncs, standups, design reviews, triage, planning or ad-hoc meetings with short duration
- Situations that require a concise record of decisions, assigned action items, and follow-ups
- Creating a standardized minutes document from a live meeting, transcript, recording, or notes

---

## Operational Workflow

### Phase 1: Intake (before drafting)

- Obtain meeting metadata: title, date, start/end time (or duration), organizer, and intended audience.
- Confirm available inputs: agenda, slides, recording, transcript, or raw notes.
- If key details are missing, ask up to 3 clarifying questions before producing minutes (see "Discovery" below).

### Phase 2: Capture (during / immediately after meeting)

- Record attendees and absentees.
- Capture brief notes per agenda item with time markers if available.
- Record explicit decisions, rationale summary (1–2 sentences), and action items (owner + due date).

### Phase 3: Drafting

- Generate minutes following the **Strict Minutes Schema** (below).
- Ensure every action item includes owner, due date (or timeframe), and acceptance criteria when applicable.
- Mark unresolved issues or items requiring follow-up in the Parking Lot.

### Phase 4: Review & Publish

- If possible, send draft to meeting organizer or a designated reviewer for quick verification (within 24 hours).
- Publish final minutes to the agreed channel (shared drive, repo, ticket, or email) and optionally create tasks in the team''s tracker.

---

## Discovery (required clarifying questions)

Before generating minutes, the agent **MUST** ask up to three clarifying questions if any of these are missing:

- What is the meeting title, date, start time (or duration), and organizer?
- Is there an agenda or transcript/recording to reference? If yes, please provide.
- Who should be assigned as the reviewer or approver for the minutes?

If the user responds "no transcript" or "no agenda," proceed but mark source material as "ad-hoc notes" and flag potential gaps.

---

## Strict Minutes Schema (Output Structure)

You **MUST** produce meeting minutes following this exact structure. If information is unavailable, use `TBD` or `Unknown` and explain how to obtain it.

### 1. Metadata

- **Title**:
- **Date (YYYY-MM-DD)**:
- **Start Time (UTC)**:
- **End Time (UTC) or Duration**:
- **Organizer**:
- **Location / Virtual Link**:
- **Minutes Author** (agent or person):
- **Distribution List** (who receives the minutes):

### 2. Attendance

- **Present**: [list of names + roles]
- **Regrets / Absent**: [list]
- **Notetaker / Recorder**: [name or "agent"]

### 3. Agenda

Bullet list of agenda items, in order:

- Item 1: short title
- Item 2: short title
- ...

### 4. Summary

A concise one-paragraph summary (1–3 sentences) of the meeting''s objective and high-level outcome.

### 5. Decisions Made

Each as a separate bullet:

- **Decision 1**: statement of decision.
  - Who decided / approved: [name(s) or group]
  - Rationale (1–2 sentences): brief reason.
  - Effective date (if applicable): YYYY-MM-DD
- **Decision 2**: ...

### 6. Action Items

Table-style bullets; **must include owner and due date**:

- **[ID] Action**: short description
  - **Owner**: Name (team)
  - **Due**: YYYY-MM-DD or "ASAP" / timeframe
  - **Acceptance Criteria**: (what completes this action)
  - **Linked artifacts / tickets**: (optional URL or ticket id)

**Example:**

- [A1] Draft deployment runbook for feature X
  - Owner: Alex (Engineering)
  - Due: 2026-02-05
  - Acceptance Criteria: runbook includes steps for rollback, health checks, and monitoring links
  - Linked artifacts: https://github.com/owner/repo/issues/123

### 7. Notes by Agenda Item

Brief, factual, timestamp optional:

- **Agenda Item 1**: title
  - Key points:
    - Point A (timestamp 00:05)
    - Point B (timestamp 00:12)
  - Open issues / questions:
    - Q1: question text (owner if assigned)
- **Agenda Item 2**: ...

### 8. Parking Lot / Unresolved Items

- **Item**: short description
  - Why parked / next step:
  - Suggested owner or next meeting to resolve

### 9. Risks / Blockers (if any)

- **Risk 1**: short description, impact, mitigation owner
- **Risk 2**: ...

### 10. Next Meeting / Follow-up

- Proposed date/time (if any)
- Objectives for next meeting

### 11. Attachments / References

- Agenda document: URL
- Slides: URL
- Transcript / Recording: URL
- Related tickets: list of URLs or IDs

### 12. Version & Change Log

- **Version**: 1.0
- **Last updated**: YYYY-MM-DDTHH:MM:SSZ
- **Changes**: short notes on edits and who made them

---

## Style & Quality Rules

- Keep minutes concise: total length should typically be under 1 A4 page for meetings <= 30 minutes and under 2 pages for meetings close to 60 minutes.
- Use plain language and bullet lists for readability.
- Prioritize decisions and action items at the top of the document.
- Do NOT include speculative language or unverified claims. If something is uncertain, label it `TBD` and note the missing info source.
- Use consistent timestamps and ISO 8601 dates (YYYY-MM-DD or full UTC timestamp).

---

## DO / DON''T

**DO:**

- Include owner and due date for every action item.
- Provide acceptance criteria for action items when possible.
- Link to artifacts (tickets, slides, recordings) for traceability.
- Send draft for quick review if minutes contain significant decisions.

**DON''T:**

- Omit decisions or action items — these are the primary value of minutes.
- Mix personal opinions with facts. Keep commentary clearly marked as "Opinion" or exclude it.
- Publish raw PII gathered during discussion unless required and authorized.

---

## Example Prompts (for Copilot / Agent)

**Prompt to generate minutes from transcript:**

> "Generate meeting minutes from the following meeting transcript. Meeting title: ''Platform Weekly Sync''. Date: 2026-02-10. Duration: 45 minutes. Organizer: Priya (Platform Lead). Transcript: <paste transcript>. Follow the Strict Minutes Schema. Highlight decisions and create action items with owners and due dates where implied."

**Prompt to generate minutes from notes:**

> "I have raw notes from a 30-minute design review. Title: ''Feature Y Design Review''. Date: 2026-02-11. Notes: <paste notes>. Produce concise minutes following the Strict Minutes Schema. Ask up to 3 clarifying questions if critical fields are missing."

---

## Quick Templates (copyable)

### Concise minutes template (short):

```
- Title:
- Date:
- Organizer:
- Present:
- Summary:
- Decisions:
  - Decision 1 — Who — Effective:
- Action Items:
  - [A1] Action — Owner — Due — Acceptance Criteria
- Next Steps / Next Meeting:
```

### Detailed minutes template (full schema):

Use the Strict Minutes Schema above.

---

## Verification & Acceptance Criteria for Generated Minutes

A generated minutes document is acceptable if:

- It contains Metadata, Attendance, Decisions, and Action Items sections.
- Every action item has an assigned owner and a due date or a clear timeframe.
- All significant decisions are captured with at least 1-line rationale.
- Attachments or references are listed or explicitly marked `None`.
- The document is factual; uncertain items are labeled `TBD`.
' WHERE slug = 'github-meeting-minutes';
UPDATE skills SET content = '---
name: github-issues
description: ''Create, update, and manage GitHub issues using MCP tools. Use this skill when users want to create bug reports, feature requests, or task issues, update existing issues, add labels/assignees/milestones, or manage issue workflows. Triggers on requests like "create an issue", "file a bug", "request a feature", "update issue X", or any GitHub issue management task.''
---

# GitHub Issues

Manage GitHub issues using the `@modelcontextprotocol/server-github` MCP server.

## Available MCP Tools

| Tool | Purpose |
|------|---------|
| `mcp__github__create_issue` | Create new issues |
| `mcp__github__update_issue` | Update existing issues |
| `mcp__github__get_issue` | Fetch issue details |
| `mcp__github__search_issues` | Search issues |
| `mcp__github__add_issue_comment` | Add comments |
| `mcp__github__list_issues` | List repository issues |

## Workflow

1. **Determine action**: Create, update, or query?
2. **Gather context**: Get repo info, existing labels, milestones if needed
3. **Structure content**: Use appropriate template from [references/templates.md](references/templates.md)
4. **Execute**: Call the appropriate MCP tool
5. **Confirm**: Report the issue URL to user

## Creating Issues

### Required Parameters

```
owner: repository owner (org or user)
repo: repository name  
title: clear, actionable title
body: structured markdown content
```

### Optional Parameters

```
labels: ["bug", "enhancement", "documentation", ...]
assignees: ["username1", "username2"]
milestone: milestone number (integer)
```

### Title Guidelines

- Start with type prefix when useful: `[Bug]`, `[Feature]`, `[Docs]`
- Be specific and actionable
- Keep under 72 characters
- Examples:
  - `[Bug] Login fails with SSO enabled`
  - `[Feature] Add dark mode support`
  - `Add unit tests for auth module`

### Body Structure

Always use the templates in [references/templates.md](references/templates.md). Choose based on issue type:

| User Request | Template |
|--------------|----------|
| Bug, error, broken, not working | Bug Report |
| Feature, enhancement, add, new | Feature Request |
| Task, chore, refactor, update | Task |

## Updating Issues

Use `mcp__github__update_issue` with:

```
owner, repo, issue_number (required)
title, body, state, labels, assignees, milestone (optional - only changed fields)
```

State values: `open`, `closed`

## Examples

### Example 1: Bug Report

**User**: "Create a bug issue - the login page crashes when using SSO"

**Action**: Call `mcp__github__create_issue` with:
```json
{
  "owner": "github",
  "repo": "awesome-copilot",
  "title": "[Bug] Login page crashes when using SSO",
  "body": "## Description\nThe login page crashes when users attempt to authenticate using SSO.\n\n## Steps to Reproduce\n1. Navigate to login page\n2. Click ''Sign in with SSO''\n3. Page crashes\n\n## Expected Behavior\nSSO authentication should complete and redirect to dashboard.\n\n## Actual Behavior\nPage becomes unresponsive and displays error.\n\n## Environment\n- Browser: [To be filled]\n- OS: [To be filled]\n\n## Additional Context\nReported by user.",
  "labels": ["bug"]
}
```

### Example 2: Feature Request

**User**: "Create a feature request for dark mode with high priority"

**Action**: Call `mcp__github__create_issue` with:
```json
{
  "owner": "github",
  "repo": "awesome-copilot",
  "title": "[Feature] Add dark mode support",
  "body": "## Summary\nAdd dark mode theme option for improved user experience and accessibility.\n\n## Motivation\n- Reduces eye strain in low-light environments\n- Increasingly expected by users\n- Improves accessibility\n\n## Proposed Solution\nImplement theme toggle with system preference detection.\n\n## Acceptance Criteria\n- [ ] Toggle switch in settings\n- [ ] Persists user preference\n- [ ] Respects system preference by default\n- [ ] All UI components support both themes\n\n## Alternatives Considered\nNone specified.\n\n## Additional Context\nHigh priority request.",
  "labels": ["enhancement", "high-priority"]
}
```

## Common Labels

Use these standard labels when applicable:

| Label | Use For |
|-------|---------|
| `bug` | Something isn''t working |
| `enhancement` | New feature or improvement |
| `documentation` | Documentation updates |
| `good first issue` | Good for newcomers |
| `help wanted` | Extra attention needed |
| `question` | Further information requested |
| `wontfix` | Will not be addressed |
| `duplicate` | Already exists |
| `high-priority` | Urgent issues |

## Tips

- Always confirm the repository context before creating issues
- Ask for missing critical information rather than guessing
- Link related issues when known: `Related to #123`
- For updates, fetch current issue first to preserve unchanged fields
' WHERE slug = 'github-github-issues';
UPDATE skills SET content = '---
name: vscode-ext-commands
description: ''Guidelines for contributing commands in VS Code extensions. Indicates naming convention, visibility, localization and other relevant attributes, following VS Code extension development guidelines, libraries and good practices''
---

# VS Code extension command contribution

This skill helps you to contribute commands in VS Code extensions

## When to use this skill

Use this skill when you need to:
- Add or update commands to your VS Code extension

# Instructions

VS Code commands must always define a `title`, independent of its category, visibility or location. We use a few patterns for each "kind" of command, with some characteristics, described below:

* Regular commands: By default, all commands should be accessible in the Command Palette, must define a `category`, and don''t need an `icon`, unless the command will be used in the Side Bar.

* Side Bar commands: Its name follows a special pattern, starting with underscore (`_`) and suffixed with `#sideBar`, like `_extensionId.someCommand#sideBar` for instance. Must define an `icon`, and may or may not have some rule for `enablement`. Side Bar exclusive commands should not be visible in the Command Palette. Contributing it to the `view/title` or `view/item/context`, we must inform _order/position_ that it will be displayed, and we can use terms "relative to other command/button" in order to you identify the correct `group` to be used. Also, it''s a good practice to define the condition (`when`) for the new command is visible.
' WHERE slug = 'github-vscode-ext-commands';
UPDATE skills SET content = '---
name: prd
description: ''Generate high-quality Product Requirements Documents (PRDs) for software systems and AI-powered features. Includes executive summaries, user stories, technical specifications, and risk analysis.''
license: MIT
---

# Product Requirements Document (PRD)

## Overview

Design comprehensive, production-grade Product Requirements Documents (PRDs) that bridge the gap between business vision and technical execution. This skill works for modern software systems, ensuring that requirements are clearly defined.

## When to Use

Use this skill when:

- Starting a new product or feature development cycle
- Translating a vague idea into a concrete technical specification
- Defining requirements for AI-powered features
- Stakeholders need a unified "source of truth" for project scope
- User asks to "write a PRD", "document requirements", or "plan a feature"

---

## Operational Workflow

### Phase 1: Discovery (The Interview)

Before writing a single line of the PRD, you **MUST** interrogate the user to fill knowledge gaps. Do not assume context.

**Ask about:**

- **The Core Problem**: Why are we building this now?
- **Success Metrics**: How do we know it worked?
- **Constraints**: Budget, tech stack, or deadline?

### Phase 2: Analysis & Scoping

Synthesize the user''s input. Identify dependencies and hidden complexities.

- Map out the **User Flow**.
- Define **Non-Goals** to protect the timeline.

### Phase 3: Technical Drafting

Generate the document using the **Strict PRD Schema** below.

---

## PRD Quality Standards

### Requirements Quality

Use concrete, measurable criteria. Avoid "fast", "easy", or "intuitive".

```diff
# Vague (BAD)
- The search should be fast and return relevant results.
- The UI must look modern and be easy to use.

# Concrete (GOOD)
+ The search must return results within 200ms for a 10k record dataset.
+ The search algorithm must achieve >= 85% Precision@10 in benchmark evals.
+ The UI must follow the ''Vercel/Next.js'' design system and achieve 100% Lighthouse Accessibility score.
```

---

## Strict PRD Schema

You **MUST** follow this exact structure for the output:

### 1. Executive Summary

- **Problem Statement**: 1-2 sentences on the pain point.
- **Proposed Solution**: 1-2 sentences on the fix.
- **Success Criteria**: 3-5 measurable KPIs.

### 2. User Experience & Functionality

- **User Personas**: Who is this for?
- **User Stories**: `As a [user], I want to [action] so that [benefit].`
- **Acceptance Criteria**: Bulleted list of "Done" definitions for each story.
- **Non-Goals**: What are we NOT building?

### 3. AI System Requirements (If Applicable)

- **Tool Requirements**: What tools and APIs are needed?
- **Evaluation Strategy**: How to measure output quality and accuracy.

### 4. Technical Specifications

- **Architecture Overview**: Data flow and component interaction.
- **Integration Points**: APIs, DBs, and Auth.
- **Security & Privacy**: Data handling and compliance.

### 5. Risks & Roadmap

- **Phased Rollout**: MVP -> v1.1 -> v2.0.
- **Technical Risks**: Latency, cost, or dependency failures.

---

## Implementation Guidelines

### DO (Always)

- **Define Testing**: For AI systems, specify how to test and validate output quality.
- **Iterate**: Present a draft and ask for feedback on specific sections.

### DON''T (Avoid)

- **Skip Discovery**: Never write a PRD without asking at least 2 clarifying questions first.
- **Hallucinate Constraints**: If the user didn''t specify a tech stack, ask or label it as `TBD`.

---

## Example: Intelligent Search System

### 1. Executive Summary

**Problem**: Users struggle to find specific documentation snippets in massive repositories.
**Solution**: An intelligent search system that provides direct answers with source citations.
**Success**:

- Reduce search time by 50%.
- Citation accuracy >= 95%.

### 2. User Stories

- **Story**: As a developer, I want to ask natural language questions so I don''t have to guess keywords.
- **AC**:
  - Supports multi-turn clarification.
  - Returns code blocks with "Copy" button.

### 3. AI System Architecture

- **Tools Required**: `codesearch`, `grep`, `webfetch`.

### 4. Evaluation

- **Benchmark**: Test with 50 common developer questions.
- **Pass Rate**: 90% must match expected citations.
' WHERE slug = 'github-prd';
UPDATE skills SET content = '---
name: git-commit
description: ''Execute git commit with conventional commit message analysis, intelligent staging, and message generation. Use when user asks to commit changes, create a git commit, or mentions "/commit". Supports: (1) Auto-detecting type and scope from changes, (2) Generating conventional commit messages from diff, (3) Interactive commit with optional type/scope/description overrides, (4) Intelligent file staging for logical grouping''
license: MIT
allowed-tools: Bash
---

# Git Commit with Conventional Commits

## Overview

Create standardized, semantic git commits using the Conventional Commits specification. Analyze the actual diff to determine appropriate type, scope, and message.

## Conventional Commit Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

## Commit Types

| Type       | Purpose                        |
| ---------- | ------------------------------ |
| `feat`     | New feature                    |
| `fix`      | Bug fix                        |
| `docs`     | Documentation only             |
| `style`    | Formatting/style (no logic)    |
| `refactor` | Code refactor (no feature/fix) |
| `perf`     | Performance improvement        |
| `test`     | Add/update tests               |
| `build`    | Build system/dependencies      |
| `ci`       | CI/config changes              |
| `chore`    | Maintenance/misc               |
| `revert`   | Revert commit                  |

## Breaking Changes

```
# Exclamation mark after type/scope
feat!: remove deprecated endpoint

# BREAKING CHANGE footer
feat: allow config to extend other configs

BREAKING CHANGE: `extends` key behavior changed
```

## Workflow

### 1. Analyze Diff

```bash
# If files are staged, use staged diff
git diff --staged

# If nothing staged, use working tree diff
git diff

# Also check status
git status --porcelain
```

### 2. Stage Files (if needed)

If nothing is staged or you want to group changes differently:

```bash
# Stage specific files
git add path/to/file1 path/to/file2

# Stage by pattern
git add *.test.*
git add src/components/*

# Interactive staging
git add -p
```

**Never commit secrets** (.env, credentials.json, private keys).

### 3. Generate Commit Message

Analyze the diff to determine:

- **Type**: What kind of change is this?
- **Scope**: What area/module is affected?
- **Description**: One-line summary of what changed (present tense, imperative mood, <72 chars)

### 4. Execute Commit

```bash
# Single line
git commit -m "<type>[scope]: <description>"

# Multi-line with body/footer
git commit -m "$(cat <<''EOF''
<type>[scope]: <description>

<optional body>

<optional footer>
EOF
)"
```

## Best Practices

- One logical change per commit
- Present tense: "add" not "added"
- Imperative mood: "fix bug" not "fixes bug"
- Reference issues: `Closes #123`, `Refs #456`
- Keep description under 72 characters

## Git Safety Protocol

- NEVER update git config
- NEVER run destructive commands (--force, hard reset) without explicit request
- NEVER skip hooks (--no-verify) unless user asks
- NEVER force push to main/master
- If commit fails due to hooks, fix and create NEW commit (don''t amend)
' WHERE slug = 'github-git-commit';
UPDATE skills SET content = '---
name: azure-role-selector
description: When user is asking for guidance for which role to assign to an identity given desired permissions, this agent helps them understand the role that will meet the requirements with least privilege access and how to apply that role.
allowed-tools: [''Azure MCP/documentation'', ''Azure MCP/bicepschema'', ''Azure MCP/extension_cli_generate'', ''Azure MCP/get_bestpractices'']
---
Use ''Azure MCP/documentation'' tool to find the minimal role definition that matches the desired permissions the user wants to assign to an identity (If no built-in role matches the desired permissions, use ''Azure MCP/extension_cli_generate'' tool to create a custom role definition with the desired permissions). Use ''Azure MCP/extension_cli_generate'' tool to generate the CLI commands needed to assign that role to the identity and use the ''Azure MCP/bicepschema'' and the ''Azure MCP/get_bestpractices'' tool to provide a Bicep code snippet for adding the role assignment.
' WHERE slug = 'github-azure-role-selector';
UPDATE skills SET content = '---
name: agentic-eval
description: |
  Patterns and techniques for evaluating and improving AI agent outputs. Use this skill when:
  - Implementing self-critique and reflection loops
  - Building evaluator-optimizer pipelines for quality-critical generation
  - Creating test-driven code refinement workflows
  - Designing rubric-based or LLM-as-judge evaluation systems
  - Adding iterative improvement to agent outputs (code, reports, analysis)
  - Measuring and improving agent response quality
---

# Agentic Evaluation Patterns

Patterns for self-improvement through iterative evaluation and refinement.

## Overview

Evaluation patterns enable agents to assess and improve their own outputs, moving beyond single-shot generation to iterative refinement loops.

```
Generate → Evaluate → Critique → Refine → Output
    ↑                              │
    └──────────────────────────────┘
```

## When to Use

- **Quality-critical generation**: Code, reports, analysis requiring high accuracy
- **Tasks with clear evaluation criteria**: Defined success metrics exist
- **Content requiring specific standards**: Style guides, compliance, formatting

---

## Pattern 1: Basic Reflection

Agent evaluates and improves its own output through self-critique.

```python
def reflect_and_refine(task: str, criteria: list[str], max_iterations: int = 3) -> str:
    """Generate with reflection loop."""
    output = llm(f"Complete this task:\n{task}")
    
    for i in range(max_iterations):
        # Self-critique
        critique = llm(f"""
        Evaluate this output against criteria: {criteria}
        Output: {output}
        Rate each: PASS/FAIL with feedback as JSON.
        """)
        
        critique_data = json.loads(critique)
        all_pass = all(c["status"] == "PASS" for c in critique_data.values())
        if all_pass:
            return output
        
        # Refine based on critique
        failed = {k: v["feedback"] for k, v in critique_data.items() if v["status"] == "FAIL"}
        output = llm(f"Improve to address: {failed}\nOriginal: {output}")
    
    return output
```

**Key insight**: Use structured JSON output for reliable parsing of critique results.

---

## Pattern 2: Evaluator-Optimizer

Separate generation and evaluation into distinct components for clearer responsibilities.

```python
class EvaluatorOptimizer:
    def __init__(self, score_threshold: float = 0.8):
        self.score_threshold = score_threshold
    
    def generate(self, task: str) -> str:
        return llm(f"Complete: {task}")
    
    def evaluate(self, output: str, task: str) -> dict:
        return json.loads(llm(f"""
        Evaluate output for task: {task}
        Output: {output}
        Return JSON: {{"overall_score": 0-1, "dimensions": {{"accuracy": ..., "clarity": ...}}}}
        """))
    
    def optimize(self, output: str, feedback: dict) -> str:
        return llm(f"Improve based on feedback: {feedback}\nOutput: {output}")
    
    def run(self, task: str, max_iterations: int = 3) -> str:
        output = self.generate(task)
        for _ in range(max_iterations):
            evaluation = self.evaluate(output, task)
            if evaluation["overall_score"] >= self.score_threshold:
                break
            output = self.optimize(output, evaluation)
        return output
```

---

## Pattern 3: Code-Specific Reflection

Test-driven refinement loop for code generation.

```python
class CodeReflector:
    def reflect_and_fix(self, spec: str, max_iterations: int = 3) -> str:
        code = llm(f"Write Python code for: {spec}")
        tests = llm(f"Generate pytest tests for: {spec}\nCode: {code}")
        
        for _ in range(max_iterations):
            result = run_tests(code, tests)
            if result["success"]:
                return code
            code = llm(f"Fix error: {result[''error'']}\nCode: {code}")
        return code
```

---

## Evaluation Strategies

### Outcome-Based
Evaluate whether output achieves the expected result.

```python
def evaluate_outcome(task: str, output: str, expected: str) -> str:
    return llm(f"Does output achieve expected outcome? Task: {task}, Expected: {expected}, Output: {output}")
```

### LLM-as-Judge
Use LLM to compare and rank outputs.

```python
def llm_judge(output_a: str, output_b: str, criteria: str) -> str:
    return llm(f"Compare outputs A and B for {criteria}. Which is better and why?")
```

### Rubric-Based
Score outputs against weighted dimensions.

```python
RUBRIC = {
    "accuracy": {"weight": 0.4},
    "clarity": {"weight": 0.3},
    "completeness": {"weight": 0.3}
}

def evaluate_with_rubric(output: str, rubric: dict) -> float:
    scores = json.loads(llm(f"Rate 1-5 for each dimension: {list(rubric.keys())}\nOutput: {output}"))
    return sum(scores[d] * rubric[d]["weight"] for d in rubric) / 5
```

---

## Best Practices

| Practice | Rationale |
|----------|-----------|
| **Clear criteria** | Define specific, measurable evaluation criteria upfront |
| **Iteration limits** | Set max iterations (3-5) to prevent infinite loops |
| **Convergence check** | Stop if output score isn''t improving between iterations |
| **Log history** | Keep full trajectory for debugging and analysis |
| **Structured output** | Use JSON for reliable parsing of evaluation results |

---

## Quick Start Checklist

```markdown
## Evaluation Implementation Checklist

### Setup
- [ ] Define evaluation criteria/rubric
- [ ] Set score threshold for "good enough"
- [ ] Configure max iterations (default: 3)

### Implementation
- [ ] Implement generate() function
- [ ] Implement evaluate() function with structured output
- [ ] Implement optimize() function
- [ ] Wire up the refinement loop

### Safety
- [ ] Add convergence detection
- [ ] Log all iterations for debugging
- [ ] Handle evaluation parse failures gracefully
```
' WHERE slug = 'github-agentic-eval';
UPDATE skills SET content = '---
name: gh-cli
description: GitHub CLI (gh) comprehensive reference for repositories, issues, pull requests, Actions, projects, releases, gists, codespaces, organizations, extensions, and all GitHub operations from the command line.
---

# GitHub CLI (gh)

Comprehensive reference for GitHub CLI (gh) - work seamlessly with GitHub from the command line.

**Version:** 2.85.0 (current as of January 2026)

## Prerequisites

### Installation

```bash
# macOS
brew install gh

# Linux
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install gh

# Windows
winget install --id GitHub.cli

# Verify installation
gh --version
```

### Authentication

```bash
# Interactive login (default: github.com)
gh auth login

# Login with specific hostname
gh auth login --hostname enterprise.internal

# Login with token
gh auth login --with-token < mytoken.txt

# Check authentication status
gh auth status

# Switch accounts
gh auth switch --hostname github.com --user username

# Logout
gh auth logout --hostname github.com --user username
```

### Setup Git Integration

```bash
# Configure git to use gh as credential helper
gh auth setup-git

# View active token
gh auth token

# Refresh authentication scopes
gh auth refresh --scopes write:org,read:public_key
```

## CLI Structure

```
gh                          # Root command
├── auth                    # Authentication
│   ├── login
│   ├── logout
│   ├── refresh
│   ├── setup-git
│   ├── status
│   ├── switch
│   └── token
├── browse                  # Open in browser
├── codespace               # GitHub Codespaces
│   ├── code
│   ├── cp
│   ├── create
│   ├── delete
│   ├── edit
│   ├── jupyter
│   ├── list
│   ├── logs
│   ├── ports
│   ├── rebuild
│   ├── ssh
│   ├── stop
│   └── view
├── gist                    # Gists
│   ├── clone
│   ├── create
│   ├── delete
│   ├── edit
│   ├── list
│   ├── rename
│   └── view
├── issue                   # Issues
│   ├── create
│   ├── list
│   ├── status
│   ├── close
│   ├── comment
│   ├── delete
│   ├── develop
│   ├── edit
│   ├── lock
│   ├── pin
│   ├── reopen
│   ├── transfer
│   ├── unlock
│   └── view
├── org                     # Organizations
│   └── list
├── pr                      # Pull Requests
│   ├── create
│   ├── list
│   ├── status
│   ├── checkout
│   ├── checks
│   ├── close
│   ├── comment
│   ├── diff
│   ├── edit
│   ├── lock
│   ├── merge
│   ├── ready
│   ├── reopen
│   ├── revert
│   ├── review
│   ├── unlock
│   ├── update-branch
│   └── view
├── project                 # Projects
│   ├── close
│   ├── copy
│   ├── create
│   ├── delete
│   ├── edit
│   ├── field-create
│   ├── field-delete
│   ├── field-list
│   ├── item-add
│   ├── item-archive
│   ├── item-create
│   ├── item-delete
│   ├── item-edit
│   ├── item-list
│   ├── link
│   ├── list
│   ├── mark-template
│   ├── unlink
│   └── view
├── release                 # Releases
│   ├── create
│   ├── list
│   ├── delete
│   ├── delete-asset
│   ├── download
│   ├── edit
│   ├── upload
│   ├── verify
│   ├── verify-asset
│   └── view
├── repo                    # Repositories
│   ├── create
│   ├── list
│   ├── archive
│   ├── autolink
│   ├── clone
│   ├── delete
│   ├── deploy-key
│   ├── edit
│   ├── fork
│   ├── gitignore
│   ├── license
│   ├── rename
│   ├── set-default
│   ├── sync
│   ├── unarchive
│   └── view
├── cache                   # Actions caches
│   ├── delete
│   └── list
├── run                     # Workflow runs
│   ├── cancel
│   ├── delete
│   ├── download
│   ├── list
│   ├── rerun
│   ├── view
│   └── watch
├── workflow                # Workflows
│   ├── disable
│   ├── enable
│   ├── list
│   ├── run
│   └── view
├── agent-task              # Agent tasks
├── alias                   # Command aliases
│   ├── delete
│   ├── import
│   ├── list
│   └── set
├── api                     # API requests
├── attestation             # Artifact attestations
│   ├── download
│   ├── trusted-root
│   └── verify
├── completion              # Shell completion
├── config                  # Configuration
│   ├── clear-cache
│   ├── get
│   ├── list
│   └── set
├── extension               # Extensions
│   ├── browse
│   ├── create
│   ├── exec
│   ├── install
│   ├── list
│   ├── remove
│   ├── search
│   └── upgrade
├── gpg-key                 # GPG keys
│   ├── add
│   ├── delete
│   └── list
├── label                   # Labels
│   ├── clone
│   ├── create
│   ├── delete
│   ├── edit
│   └── list
├── preview                 # Preview features
├── ruleset                 # Rulesets
│   ├── check
│   ├── list
│   └── view
├── search                  # Search
│   ├── code
│   ├── commits
│   ├── issues
│   ├── prs
│   └── repos
├── secret                  # Secrets
│   ├── delete
│   ├── list
│   └── set
├── ssh-key                 # SSH keys
│   ├── add
│   ├── delete
│   └── list
├── status                  # Status overview
└── variable                # Variables
    ├── delete
    ├── get
    ├── list
    └── set
```

## Configuration

### Global Configuration

```bash
# List all configuration
gh config list

# Get specific configuration value
gh config list git_protocol
gh config get editor

# Set configuration value
gh config set editor vim
gh config set git_protocol ssh
gh config set prompt disabled
gh config set pager "less -R"

# Clear configuration cache
gh config clear-cache
```

### Environment Variables

```bash
# GitHub token (for automation)
export GH_TOKEN=ghp_xxxxxxxxxxxx

# GitHub hostname
export GH_HOST=github.com

# Disable prompts
export GH_PROMPT_DISABLED=true

# Custom editor
export GH_EDITOR=vim

# Custom pager
export GH_PAGER=less

# HTTP timeout
export GH_TIMEOUT=30

# Custom repository (override default)
export GH_REPO=owner/repo

# Custom git protocol
export GH_ENTERPRISE_HOSTNAME=hostname
```

## Authentication (gh auth)

### Login

```bash
# Interactive login
gh auth login

# Web-based authentication
gh auth login --web

# With clipboard for OAuth code
gh auth login --web --clipboard

# With specific git protocol
gh auth login --git-protocol ssh

# With custom hostname (GitHub Enterprise)
gh auth login --hostname enterprise.internal

# Login with token from stdin
gh auth login --with-token < token.txt

# Insecure storage (plain text)
gh auth login --insecure-storage
```

### Status

```bash
# Show all authentication status
gh auth status

# Show active account only
gh auth status --active

# Show specific hostname
gh auth status --hostname github.com

# Show token in output
gh auth status --show-token

# JSON output
gh auth status --json hosts

# Filter with jq
gh auth status --json hosts --jq ''.hosts | add''
```

### Switch Accounts

```bash
# Interactive switch
gh auth switch

# Switch to specific user/host
gh auth switch --hostname github.com --user monalisa
```

### Token

```bash
# Print authentication token
gh auth token

# Token for specific host/user
gh auth token --hostname github.com --user monalisa
```

### Refresh

```bash
# Refresh credentials
gh auth refresh

# Add scopes
gh auth refresh --scopes write:org,read:public_key

# Remove scopes
gh auth refresh --remove-scopes delete_repo

# Reset to default scopes
gh auth refresh --reset-scopes

# With clipboard
gh auth refresh --clipboard
```

### Setup Git

```bash
# Setup git credential helper
gh auth setup-git

# Setup for specific host
gh auth setup-git --hostname enterprise.internal

# Force setup even if host not known
gh auth setup-git --hostname enterprise.internal --force
```

## Browse (gh browse)

```bash
# Open repository in browser
gh browse

# Open specific path
gh browse script/
gh browse main.go:312

# Open issue or PR
gh browse 123

# Open commit
gh browse 77507cd94ccafcf568f8560cfecde965fcfa63

# Open with specific branch
gh browse main.go --branch bug-fix

# Open different repository
gh browse --repo owner/repo

# Open specific pages
gh browse --actions       # Actions tab
gh browse --projects      # Projects tab
gh browse --releases      # Releases tab
gh browse --settings      # Settings page
gh browse --wiki          # Wiki page

# Print URL instead of opening
gh browse --no-browser
```

## Repositories (gh repo)

### Create Repository

```bash
# Create new repository
gh repo create my-repo

# Create with description
gh repo create my-repo --description "My awesome project"

# Create public repository
gh repo create my-repo --public

# Create private repository
gh repo create my-repo --private

# Create with homepage
gh repo create my-repo --homepage https://example.com

# Create with license
gh repo create my-repo --license mit

# Create with gitignore
gh repo create my-repo --gitignore python

# Initialize as template repository
gh repo create my-repo --template

# Create repository in organization
gh repo create org/my-repo

# Create without cloning locally
gh repo create my-repo --source=.

# Disable issues
gh repo create my-repo --disable-issues

# Disable wiki
gh repo create my-repo --disable-wiki
```

### Clone Repository

```bash
# Clone repository
gh repo clone owner/repo

# Clone to specific directory
gh repo clone owner/repo my-directory

# Clone with different branch
gh repo clone owner/repo --branch develop
```

### List Repositories

```bash
# List all repositories
gh repo list

# List repositories for owner
gh repo list owner

# Limit results
gh repo list --limit 50

# Public repositories only
gh repo list --public

# Source repositories only (not forks)
gh repo list --source

# JSON output
gh repo list --json name,visibility,owner

# Table output
gh repo list --limit 100 | tail -n +2

# Filter with jq
gh repo list --json name --jq ''.[].name''
```

### View Repository

```bash
# View repository details
gh repo view

# View specific repository
gh repo view owner/repo

# JSON output
gh repo view --json name,description,defaultBranchRef

# View in browser
gh repo view --web
```

### Edit Repository

```bash
# Edit description
gh repo edit --description "New description"

# Set homepage
gh repo edit --homepage https://example.com

# Change visibility
gh repo edit --visibility private
gh repo edit --visibility public

# Enable/disable features
gh repo edit --enable-issues
gh repo edit --disable-issues
gh repo edit --enable-wiki
gh repo edit --disable-wiki
gh repo edit --enable-projects
gh repo edit --disable-projects

# Set default branch
gh repo edit --default-branch main

# Rename repository
gh repo rename new-name

# Archive repository
gh repo archive
gh repo unarchive
```

### Delete Repository

```bash
# Delete repository
gh repo delete owner/repo

# Confirm without prompt
gh repo delete owner/repo --yes
```

### Fork Repository

```bash
# Fork repository
gh repo fork owner/repo

# Fork to organization
gh repo fork owner/repo --org org-name

# Clone after forking
gh repo fork owner/repo --clone

# Remote name for fork
gh repo fork owner/repo --remote-name upstream
```

### Sync Fork

```bash
# Sync fork with upstream
gh repo sync

# Sync specific branch
gh repo sync --branch feature

# Force sync
gh repo sync --force
```

### Set Default Repository

```bash
# Set default repository for current directory
gh repo set-default

# Set default explicitly
gh repo set-default owner/repo

# Unset default
gh repo set-default --unset
```

### Repository Autolinks

```bash
# List autolinks
gh repo autolink list

# Add autolink
gh repo autolink add \
  --key-prefix JIRA- \
  --url-template https://jira.example.com/browse/<num>

# Delete autolink
gh repo autolink delete 12345
```

### Repository Deploy Keys

```bash
# List deploy keys
gh repo deploy-key list

# Add deploy key
gh repo deploy-key add ~/.ssh/id_rsa.pub \
  --title "Production server" \
  --read-only

# Delete deploy key
gh repo deploy-key delete 12345
```

### Gitignore and License

```bash
# View gitignore template
gh repo gitignore

# View license template
gh repo license mit

# License with full name
gh repo license mit --fullname "John Doe"
```

## Issues (gh issue)

### Create Issue

```bash
# Create issue interactively
gh issue create

# Create with title
gh issue create --title "Bug: Login not working"

# Create with title and body
gh issue create \
  --title "Bug: Login not working" \
  --body "Steps to reproduce..."

# Create with body from file
gh issue create --body-file issue.md

# Create with labels
gh issue create --title "Fix bug" --labels bug,high-priority

# Create with assignees
gh issue create --title "Fix bug" --assignee user1,user2

# Create in specific repository
gh issue create --repo owner/repo --title "Issue title"

# Create issue from web
gh issue create --web
```

### List Issues

```bash
# List all open issues
gh issue list

# List all issues (including closed)
gh issue list --state all

# List closed issues
gh issue list --state closed

# Limit results
gh issue list --limit 50

# Filter by assignee
gh issue list --assignee username
gh issue list --assignee @me

# Filter by labels
gh issue list --labels bug,enhancement

# Filter by milestone
gh issue list --milestone "v1.0"

# Search/filter
gh issue list --search "is:open is:issue label:bug"

# JSON output
gh issue list --json number,title,state,author

# Table view
gh issue list --json number,title,labels --jq ''.[] | [.number, .title, .labels[].name] | @tsv''

# Show comments count
gh issue list --json number,title,comments --jq ''.[] | [.number, .title, .comments]''

# Sort by
gh issue list --sort created --order desc
```

### View Issue

```bash
# View issue
gh issue view 123

# View with comments
gh issue view 123 --comments

# View in browser
gh issue view 123 --web

# JSON output
gh issue view 123 --json title,body,state,labels,comments

# View specific fields
gh issue view 123 --json title --jq ''.title''
```

### Edit Issue

```bash
# Edit interactively
gh issue edit 123

# Edit title
gh issue edit 123 --title "New title"

# Edit body
gh issue edit 123 --body "New description"

# Add labels
gh issue edit 123 --add-label bug,high-priority

# Remove labels
gh issue edit 123 --remove-label stale

# Add assignees
gh issue edit 123 --add-assignee user1,user2

# Remove assignees
gh issue edit 123 --remove-assignee user1

# Set milestone
gh issue edit 123 --milestone "v1.0"
```

### Close/Reopen Issue

```bash
# Close issue
gh issue close 123

# Close with comment
gh issue close 123 --comment "Fixed in PR #456"

# Reopen issue
gh issue reopen 123
```

### Comment on Issue

```bash
# Add comment
gh issue comment 123 --body "This looks good!"

# Edit comment
gh issue comment 123 --edit 456789 --body "Updated comment"

# Delete comment
gh issue comment 123 --delete 456789
```

### Issue Status

```bash
# Show issue status summary
gh issue status

# Status for specific repository
gh issue status --repo owner/repo
```

### Pin/Unpin Issues

```bash
# Pin issue (pinned to repo dashboard)
gh issue pin 123

# Unpin issue
gh issue unpin 123
```

### Lock/Unlock Issue

```bash
# Lock conversation
gh issue lock 123

# Lock with reason
gh issue lock 123 --reason off-topic

# Unlock
gh issue unlock 123
```

### Transfer Issue

```bash
# Transfer to another repository
gh issue transfer 123 --repo owner/new-repo
```

### Delete Issue

```bash
# Delete issue
gh issue delete 123

# Confirm without prompt
gh issue delete 123 --yes
```

### Develop Issue (Draft PR)

```bash
# Create draft PR from issue
gh issue develop 123

# Create in specific branch
gh issue develop 123 --branch fix/issue-123

# Create with base branch
gh issue develop 123 --base main
```

## Pull Requests (gh pr)

### Create Pull Request

```bash
# Create PR interactively
gh pr create

# Create with title
gh pr create --title "Feature: Add new functionality"

# Create with title and body
gh pr create \
  --title "Feature: Add new functionality" \
  --body "This PR adds..."

# Fill body from template
gh pr create --body-file .github/PULL_REQUEST_TEMPLATE.md

# Set base branch
gh pr create --base main

# Set head branch (default: current branch)
gh pr create --head feature-branch

# Create draft PR
gh pr create --draft

# Add assignees
gh pr create --assignee user1,user2

# Add reviewers
gh pr create --reviewer user1,user2

# Add labels
gh pr create --labels enhancement,feature

# Link to issue
gh pr create --issue 123

# Create in specific repository
gh pr create --repo owner/repo

# Open in browser after creation
gh pr create --web
```

### List Pull Requests

```bash
# List open PRs
gh pr list

# List all PRs
gh pr list --state all

# List merged PRs
gh pr list --state merged

# List closed (not merged) PRs
gh pr list --state closed

# Filter by head branch
gh pr list --head feature-branch

# Filter by base branch
gh pr list --base main

# Filter by author
gh pr list --author username
gh pr list --author @me

# Filter by assignee
gh pr list --assignee username

# Filter by labels
gh pr list --labels bug,enhancement

# Limit results
gh pr list --limit 50

# Search
gh pr list --search "is:open is:pr label:review-required"

# JSON output
gh pr list --json number,title,state,author,headRefName

# Show check status
gh pr list --json number,title,statusCheckRollup --jq ''.[] | [.number, .title, .statusCheckRollup[]?.status]''

# Sort by
gh pr list --sort created --order desc
```

### View Pull Request

```bash
# View PR
gh pr view 123

# View with comments
gh pr view 123 --comments

# View in browser
gh pr view 123 --web

# JSON output
gh pr view 123 --json title,body,state,author,commits,files

# View diff
gh pr view 123 --json files --jq ''.files[].path''

# View with jq query
gh pr view 123 --json title,state --jq ''"\(.title): \(.state)"''
```

### Checkout Pull Request

```bash
# Checkout PR branch
gh pr checkout 123

# Checkout with specific branch name
gh pr checkout 123 --branch name-123

# Force checkout
gh pr checkout 123 --force
```

### Diff Pull Request

```bash
# View PR diff
gh pr diff 123

# View diff with color
gh pr diff 123 --color always

# Output to file
gh pr diff 123 > pr-123.patch

# View diff of specific files
gh pr diff 123 --name-only
```

### Merge Pull Request

```bash
# Merge PR
gh pr merge 123

# Merge with specific method
gh pr merge 123 --merge
gh pr merge 123 --squash
gh pr merge 123 --rebase

# Delete branch after merge
gh pr merge 123 --delete-branch

# Merge with comment
gh pr merge 123 --subject "Merge PR #123" --body "Merging feature"

# Merge draft PR
gh pr merge 123 --admin

# Force merge (skip checks)
gh pr merge 123 --admin
```

### Close Pull Request

```bash
# Close PR (as draft, not merge)
gh pr close 123

# Close with comment
gh pr close 123 --comment "Closing due to..."
```

### Reopen Pull Request

```bash
# Reopen closed PR
gh pr reopen 123
```

### Edit Pull Request

```bash
# Edit interactively
gh pr edit 123

# Edit title
gh pr edit 123 --title "New title"

# Edit body
gh pr edit 123 --body "New description"

# Add labels
gh pr edit 123 --add-label bug,enhancement

# Remove labels
gh pr edit 123 --remove-label stale

# Add assignees
gh pr edit 123 --add-assignee user1,user2

# Remove assignees
gh pr edit 123 --remove-assignee user1

# Add reviewers
gh pr edit 123 --add-reviewer user1,user2

# Remove reviewers
gh pr edit 123 --remove-reviewer user1

# Mark as ready for review
gh pr edit 123 --ready
```

### Ready for Review

```bash
# Mark draft PR as ready
gh pr ready 123
```

### Pull Request Checks

```bash
# View PR checks
gh pr checks 123

# Watch checks in real-time
gh pr checks 123 --watch

# Watch interval (seconds)
gh pr checks 123 --watch --interval 5
```

### Comment on Pull Request

```bash
# Add comment
gh pr comment 123 --body "Looks good!"

# Comment on specific line
gh pr comment 123 --body "Fix this" \
  --repo owner/repo \
  --head-owner owner --head-branch feature

# Edit comment
gh pr comment 123 --edit 456789 --body "Updated"

# Delete comment
gh pr comment 123 --delete 456789
```

### Review Pull Request

```bash
# Review PR (opens editor)
gh pr review 123

# Approve PR
gh pr review 123 --approve --body "LGTM!"

# Request changes
gh pr review 123 --request-changes \
  --body "Please fix these issues"

# Comment on PR
gh pr review 123 --comment --body "Some thoughts..."

# Dismiss review
gh pr review 123 --dismiss
```

### Update Branch

```bash
# Update PR branch with latest base branch
gh pr update-branch 123

# Force update
gh pr update-branch 123 --force

# Use merge strategy
gh pr update-branch 123 --merge
```

### Lock/Unlock Pull Request

```bash
# Lock PR conversation
gh pr lock 123

# Lock with reason
gh pr lock 123 --reason off-topic

# Unlock
gh pr unlock 123
```

### Revert Pull Request

```bash
# Revert merged PR
gh pr revert 123

# Revert with specific branch name
gh pr revert 123 --branch revert-pr-123
```

### Pull Request Status

```bash
# Show PR status summary
gh pr status

# Status for specific repository
gh pr status --repo owner/repo
```

## GitHub Actions

### Workflow Runs (gh run)

```bash
# List workflow runs
gh run list

# List for specific workflow
gh run list --workflow "ci.yml"

# List for specific branch
gh run list --branch main

# Limit results
gh run list --limit 20

# JSON output
gh run list --json databaseId,status,conclusion,headBranch

# View run details
gh run view 123456789

# View run with verbose logs
gh run view 123456789 --log

# View specific job
gh run view 123456789 --job 987654321

# View in browser
gh run view 123456789 --web

# Watch run in real-time
gh run watch 123456789

# Watch with interval
gh run watch 123456789 --interval 5

# Rerun failed run
gh run rerun 123456789

# Rerun specific job
gh run rerun 123456789 --job 987654321

# Cancel run
gh run cancel 123456789

# Delete run
gh run delete 123456789

# Download run artifacts
gh run download 123456789

# Download specific artifact
gh run download 123456789 --name build

# Download to directory
gh run download 123456789 --dir ./artifacts
```

### Workflows (gh workflow)

```bash
# List workflows
gh workflow list

# View workflow details
gh workflow view ci.yml

# View workflow YAML
gh workflow view ci.yml --yaml

# View in browser
gh workflow view ci.yml --web

# Enable workflow
gh workflow enable ci.yml

# Disable workflow
gh workflow disable ci.yml

# Run workflow manually
gh workflow run ci.yml

# Run with inputs
gh workflow run ci.yml \
  --raw-field \
  version="1.0.0" \
  environment="production"

# Run from specific branch
gh workflow run ci.yml --ref develop
```

### Action Caches (gh cache)

```bash
# List caches
gh cache list

# List for specific branch
gh cache list --branch main

# List with limit
gh cache list --limit 50

# Delete cache
gh cache delete 123456789

# Delete all caches
gh cache delete --all
```

### Action Secrets (gh secret)

```bash
# List secrets
gh secret list

# Set secret (prompts for value)
gh secret set MY_SECRET

# Set secret from environment
echo "$MY_SECRET" | gh secret set MY_SECRET

# Set secret for specific environment
gh secret set MY_SECRET --env production

# Set secret for organization
gh secret set MY_SECRET --org orgname

# Delete secret
gh secret delete MY_SECRET

# Delete from environment
gh secret delete MY_SECRET --env production
```

### Action Variables (gh variable)

```bash
# List variables
gh variable list

# Set variable
gh variable set MY_VAR "some-value"

# Set variable for environment
gh variable set MY_VAR "value" --env production

# Set variable for organization
gh variable set MY_VAR "value" --org orgname

# Get variable value
gh variable get MY_VAR

# Delete variable
gh variable delete MY_VAR

# Delete from environment
gh variable delete MY_VAR --env production
```

## Projects (gh project)

```bash
# List projects
gh project list

# List for owner
gh project list --owner owner

# Open projects
gh project list --open

# View project
gh project view 123

# View project items
gh project view 123 --format json

# Create project
gh project create --title "My Project"

# Create in organization
gh project create --title "Project" --org orgname

# Create with readme
gh project create --title "Project" --readme "Description here"

# Edit project
gh project edit 123 --title "New Title"

# Delete project
gh project delete 123

# Close project
gh project close 123

# Copy project
gh project copy 123 --owner target-owner --title "Copy"

# Mark template
gh project mark-template 123

# List fields
gh project field-list 123

# Create field
gh project field-create 123 --title "Status" --datatype single_select

# Delete field
gh project field-delete 123 --id 456

# List items
gh project item-list 123

# Create item
gh project item-create 123 --title "New item"

# Add item to project
gh project item-add 123 --owner-owner --repo repo --issue 456

# Edit item
gh project item-edit 123 --id 456 --title "Updated title"

# Delete item
gh project item-delete 123 --id 456

# Archive item
gh project item-archive 123 --id 456

# Link items
gh project link 123 --id 456 --link-id 789

# Unlink items
gh project unlink 123 --id 456 --link-id 789

# View project in browser
gh project view 123 --web
```

## Releases (gh release)

```bash
# List releases
gh release list

# View latest release
gh release view

# View specific release
gh release view v1.0.0

# View in browser
gh release view v1.0.0 --web

# Create release
gh release create v1.0.0 \
  --notes "Release notes here"

# Create release with notes from file
gh release create v1.0.0 --notes-file notes.md

# Create release with target
gh release create v1.0.0 --target main

# Create release as draft
gh release create v1.0.0 --draft

# Create pre-release
gh release create v1.0.0 --prerelease

# Create release with title
gh release create v1.0.0 --title "Version 1.0.0"

# Upload asset to release
gh release upload v1.0.0 ./file.tar.gz

# Upload multiple assets
gh release upload v1.0.0 ./file1.tar.gz ./file2.tar.gz

# Upload with label (casing sensitive)
gh release upload v1.0.0 ./file.tar.gz --casing

# Delete release
gh release delete v1.0.0

# Delete with cleanup tag
gh release delete v1.0.0 --yes

# Delete specific asset
gh release delete-asset v1.0.0 file.tar.gz

# Download release assets
gh release download v1.0.0

# Download specific asset
gh release download v1.0.0 --pattern "*.tar.gz"

# Download to directory
gh release download v1.0.0 --dir ./downloads

# Download archive (zip/tar)
gh release download v1.0.0 --archive zip

# Edit release
gh release edit v1.0.0 --notes "Updated notes"

# Verify release signature
gh release verify v1.0.0

# Verify specific asset
gh release verify-asset v1.0.0 file.tar.gz
```

## Gists (gh gist)

```bash
# List gists
gh gist list

# List all gists (including private)
gh gist list --public

# Limit results
gh gist list --limit 20

# View gist
gh gist view abc123

# View gist files
gh gist view abc123 --files

# Create gist
gh gist create script.py

# Create gist with description
gh gist create script.py --desc "My script"

# Create public gist
gh gist create script.py --public

# Create multi-file gist
gh gist create file1.py file2.py

# Create from stdin
echo "print(''hello'')" | gh gist create

# Edit gist
gh gist edit abc123

# Delete gist
gh gist delete abc123

# Rename gist file
gh gist rename abc123 --filename old.py new.py

# Clone gist
gh gist clone abc123

# Clone to directory
gh gist clone abc123 my-directory
```

## Codespaces (gh codespace)

```bash
# List codespaces
gh codespace list

# Create codespace
gh codespace create

# Create with specific repository
gh codespace create --repo owner/repo

# Create with branch
gh codespace create --branch develop

# Create with specific machine
gh codespace create --machine premiumLinux

# View codespace details
gh codespace view

# SSH into codespace
gh codespace ssh

# SSH with specific command
gh codespace ssh --command "cd /workspaces && ls"

# Open codespace in browser
gh codespace code

# Open in VS Code
gh codespace code --codec

# Open with specific path
gh codespace code --path /workspaces/repo

# Stop codespace
gh codespace stop

# Delete codespace
gh codespace delete

# View logs
gh codespace logs

--tail 100

# View ports
gh codespace ports

# Forward port
gh codespace cp 8080:8080

# Rebuild codespace
gh codespace rebuild

# Edit codespace
gh codespace edit --machine standardLinux

# Jupyter support
gh codespace jupyter

# Copy files to/from codespace
gh codespace cp file.txt :/workspaces/file.txt
gh codespace cp :/workspaces/file.txt ./file.txt
```

## Organizations (gh org)

```bash
# List organizations
gh org list

# List for user
gh org list --user username

# JSON output
gh org list --json login,name,description

# View organization
gh org view orgname

# View organization members
gh org view orgname --json members --jq ''.members[] | .login''
```

## Search (gh search)

```bash
# Search code
gh search code "TODO"

# Search in specific repository
gh search code "TODO" --repo owner/repo

# Search commits
gh search commits "fix bug"

# Search issues
gh search issues "label:bug state:open"

# Search PRs
gh search prs "is:open is:pr review:required"

# Search repositories
gh search repos "stars:>1000 language:python"

# Limit results
gh search repos "topic:api" --limit 50

# JSON output
gh search repos "stars:>100" --json name,description,stargazers

# Order results
gh search repos "language:rust" --order desc --sort stars

# Search with extensions
gh search code "import" --extension py

# Web search (open in browser)
gh search prs "is:open" --web
```

## Labels (gh label)

```bash
# List labels
gh label list

# Create label
gh label create bug --color "d73a4a" --description "Something isn''t working"

# Create with hex color
gh label create enhancement --color "#a2eeef"

# Edit label
gh label edit bug --name "bug-report" --color "ff0000"

# Delete label
gh label delete bug

# Clone labels from repository
gh label clone owner/repo

# Clone to specific repository
gh label clone owner/repo --repo target/repo
```

## SSH Keys (gh ssh-key)

```bash
# List SSH keys
gh ssh-key list

# Add SSH key
gh ssh-key add ~/.ssh/id_rsa.pub --title "My laptop"

# Add key with type
gh ssh-key add ~/.ssh/id_ed25519.pub --type "authentication"

# Delete SSH key
gh ssh-key delete 12345

# Delete by title
gh ssh-key delete --title "My laptop"
```

## GPG Keys (gh gpg-key)

```bash
# List GPG keys
gh gpg-key list

# Add GPG key
gh gpg-key add ~/.ssh/id_rsa.pub

# Delete GPG key
gh gpg-key delete 12345

# Delete by key ID
gh gpg-key delete ABCD1234
```

## Status (gh status)

```bash
# Show status overview
gh status

# Status for specific repositories
gh status --repo owner/repo

# JSON output
gh status --json
```

## Configuration (gh config)

```bash
# List all config
gh config list

# Get specific value
gh config get editor

# Set value
gh config set editor vim

# Set git protocol
gh config set git_protocol ssh

# Clear cache
gh config clear-cache

# Set prompt behavior
gh config set prompt disabled
gh config set prompt enabled
```

## Extensions (gh extension)

```bash
# List installed extensions
gh extension list

# Search extensions
gh extension search github

# Install extension
gh extension install owner/extension-repo

# Install from branch
gh extension install owner/extension-repo --branch develop

# Upgrade extension
gh extension upgrade extension-name

# Remove extension
gh extension remove extension-name

# Create new extension
gh extension create my-extension

# Browse extensions
gh extension browse

# Execute extension command
gh extension exec my-extension --arg value
```

## Aliases (gh alias)

```bash
# List aliases
gh alias list

# Set alias
gh alias set prview ''pr view --web''

# Set shell alias
gh alias set co ''pr checkout'' --shell

# Delete alias
gh alias delete prview

# Import aliases
gh alias import ./aliases.sh
```

## API Requests (gh api)

```bash
# Make API request
gh api /user

# Request with method
gh api --method POST /repos/owner/repo/issues \
  --field title="Issue title" \
  --field body="Issue body"

# Request with headers
gh api /user \
  --header "Accept: application/vnd.github.v3+json"

# Request with pagination
gh api /user/repos --paginate

# Raw output (no formatting)
gh api /user --raw

# Include headers in output
gh api /user --include

# Silent mode (no progress output)
gh api /user --silent

# Input from file
gh api --input request.json

# jq query on response
gh api /user --jq ''.login''

# Field from response
gh api /repos/owner/repo --jq ''.stargazers_count''

# GitHub Enterprise
gh api /user --hostname enterprise.internal

# GraphQL query
gh api graphql \
  -f query=''
  {
    viewer {
      login
      repositories(first: 5) {
        nodes {
          name
        }
      }
    }
  }''
```

## Rulesets (gh ruleset)

```bash
# List rulesets
gh ruleset list

# View ruleset
gh ruleset view 123

# Check ruleset
gh ruleset check --branch feature

# Check specific repository
gh ruleset check --repo owner/repo --branch main
```

## Attestations (gh attestation)

```bash
# Download attestation
gh attestation download owner/repo \
  --artifact-id 123456

# Verify attestation
gh attestation verify owner/repo

# Get trusted root
gh attestation trusted-root
```

## Completion (gh completion)

```bash
# Generate shell completion
gh completion -s bash > ~/.gh-complete.bash
gh completion -s zsh > ~/.gh-complete.zsh
gh completion -s fish > ~/.gh-complete.fish
gh completion -s powershell > ~/.gh-complete.ps1

# Shell-specific instructions
gh completion --shell=bash
gh completion --shell=zsh
```

## Preview (gh preview)

```bash
# List preview features
gh preview

# Run preview script
gh preview prompter
```

## Agent Tasks (gh agent-task)

```bash
# List agent tasks
gh agent-task list

# View agent task
gh agent-task view 123

# Create agent task
gh agent-task create --description "My task"
```

## Global Flags

| Flag                       | Description                            |
| -------------------------- | -------------------------------------- |
| `--help` / `-h`            | Show help for command                  |
| `--version`                | Show gh version                        |
| `--repo [HOST/]OWNER/REPO` | Select another repository              |
| `--hostname HOST`          | GitHub hostname                        |
| `--jq EXPRESSION`          | Filter JSON output                     |
| `--json FIELDS`            | Output JSON with specified fields      |
| `--template STRING`        | Format JSON using Go template          |
| `--web`                    | Open in browser                        |
| `--paginate`               | Make additional API calls              |
| `--verbose`                | Show verbose output                    |
| `--debug`                  | Show debug output                      |
| `--timeout SECONDS`        | Maximum API request duration           |
| `--cache CACHE`            | Cache control (default, force, bypass) |

## Output Formatting

### JSON Output

```bash
# Basic JSON
gh repo view --json name,description

# Nested fields
gh repo view --json owner,name --jq ''.owner.login + "/" + .name''

# Array operations
gh pr list --json number,title --jq ''.[] | select(.number > 100)''

# Complex queries
gh issue list --json number,title,labels \
  --jq ''.[] | {number, title: .title, tags: [.labels[].name]}''
```

### Template Output

```bash
# Custom template
gh repo view \
  --template ''{{.name}}: {{.description}}''

# Multiline template
gh pr view 123 \
  --template ''Title: {{.title}}
Author: {{.author.login}}
State: {{.state}}
''
```

## Common Workflows

### Create PR from Issue

```bash
# Create branch from issue
gh issue develop 123 --branch feature/issue-123

# Make changes, commit, push
git add .
git commit -m "Fix issue #123"
git push

# Create PR linking to issue
gh pr create --title "Fix #123" --body "Closes #123"
```

### Bulk Operations

```bash
# Close multiple issues
gh issue list --search "label:stale" \
  --json number \
  --jq ''.[].number'' | \
  xargs -I {} gh issue close {} --comment "Closing as stale"

# Add label to multiple PRs
gh pr list --search "review:required" \
  --json number \
  --jq ''.[].number'' | \
  xargs -I {} gh pr edit {} --add-label needs-review
```

### Repository Setup Workflow

```bash
# Create repository with initial setup
gh repo create my-project --public \
  --description "My awesome project" \
  --clone \
  --gitignore python \
  --license mit

cd my-project

# Set up branches
git checkout -b develop
git push -u origin develop

# Create labels
gh label create bug --color "d73a4a" --description "Bug report"
gh label create enhancement --color "a2eeef" --description "Feature request"
gh label create documentation --color "0075ca" --description "Documentation"
```

### CI/CD Workflow

```bash
# Run workflow and wait
RUN_ID=$(gh workflow run ci.yml --ref main --jq ''.databaseId'')

# Watch the run
gh run watch "$RUN_ID"

# Download artifacts on completion
gh run download "$RUN_ID" --dir ./artifacts
```

### Fork Sync Workflow

```bash
# Fork repository
gh repo fork original/repo --clone

cd repo

# Add upstream remote
git remote add upstream https://github.com/original/repo.git

# Sync fork
gh repo sync

# Or manual sync
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

## Environment Setup

### Shell Integration

```bash
# Add to ~/.bashrc or ~/.zshrc
eval "$(gh completion -s bash)"  # or zsh/fish

# Create useful aliases
alias gs=''gh status''
alias gpr=''gh pr view --web''
alias gir=''gh issue view --web''
alias gco=''gh pr checkout''
```

### Git Configuration

```bash
# Use gh as credential helper
gh auth setup-git

# Set gh as default for repo operations
git config --global credential.helper ''gh !gh auth setup-git''

# Or manually
git config --global credential.helper github
```

## Best Practices

1. **Authentication**: Use environment variables for automation

   ```bash
   export GH_TOKEN=$(gh auth token)
   ```

2. **Default Repository**: Set default to avoid repetition

   ```bash
   gh repo set-default owner/repo
   ```

3. **JSON Parsing**: Use jq for complex data extraction

   ```bash
   gh pr list --json number,title --jq ''.[] | select(.title | contains("fix"))''
   ```

4. **Pagination**: Use --paginate for large result sets

   ```bash
   gh issue list --state all --paginate
   ```

5. **Caching**: Use cache control for frequently accessed data
   ```bash
   gh api /user --cache force
   ```

## Getting Help

```bash
# General help
gh --help

# Command help
gh pr --help
gh issue create --help

# Help topics
gh help formatting
gh help environment
gh help exit-codes
gh help accessibility
```

## References

- Official Manual: https://cli.github.com/manual/
- GitHub Docs: https://docs.github.com/en/github-cli
- REST API: https://docs.github.com/en/rest
- GraphQL API: https://docs.github.com/en/graphql
' WHERE slug = 'github-gh-cli';
UPDATE skills SET content = '---
name: markdown-to-html
description: ''Convert Markdown files to HTML similar to `marked.js`, `pandoc`, `gomarkdown/markdown`, or similar tools; or writing custom script to convert markdown to html and/or working on web template systems like `jekyll/jekyll`, `gohugoio/hugo`, or similar web templating systems that utilize markdown documents, converting them to html. Use when asked to "convert markdown to html", "transform md to html", "render markdown", "generate html from markdown", or when working with .md files and/or web a templating system that converts markdown to HTML output. Supports CLI and Node.js workflows with GFM, CommonMark, and standard Markdown flavors.''
---

# Markdown to HTML Conversion

Expert skill for converting Markdown documents to HTML using the marked.js library, or writing data conversion scripts; in this case scripts similar to [markedJS/marked](https://github.com/markedjs/marked) repository. For custom scripts knowledge is not confined to `marked.js`, but data conversion methods are utilized from tools like [pandoc](https://github.com/jgm/pandoc) and [gomarkdown/markdown](https://github.com/gomarkdown/markdown) for data conversion; [jekyll/jekyll](https://github.com/jekyll/jekyll) and [gohugoio/hugo](https://github.com/gohugoio/hugo) for templating systems.

The conversion script or tool should handle single files, batch conversions, and advanced configurations.

## When to Use This Skill

- User asks to "convert markdown to html" or "transform md files"
- User wants to "render markdown" as HTML output
- User needs to generate HTML documentation from .md files
- User is building static sites from Markdown content
- User is building template system that converts markdown to html
- User is working on a tool, widget, or custom template for an existing templating system
- User wants to preview Markdown as rendered HTML

## Converting Markdown to HTML

### Essential Basic Conversions

For more see [basic-markdown-to-html.md](references/basic-markdown-to-html.md)

```text
    ```markdown
    # Level 1
    ## Level 2

    One sentence with a [link](https://example.com), and a HTML snippet like `<p>paragraph tag</p>`.

    - `ul` list item 1
    - `ul` list item 2

    1. `ol` list item 1
    2. `ol` list item 1

    | Table Item | Description |
    | One | One is the spelling of the number `1`. |
    | Two | Two is the spelling of the number `2`. |

    ```js
    var one = 1;
    var two = 2;

    function simpleMath(x, y) {
     return x + y;
    }
    console.log(simpleMath(one, two));
    ```
    ```

    ```html
    <h1>Level 1</h1>
    <h2>Level 2</h2>

    <p>One sentence with a <a href="https://example.com">link</a>, and a HTML snippet like <code>&lt;p&gt;paragraph tag&lt;/p&gt;</code>.</p>

    <ul>
     <li>`ul` list item 1</li>
     <li>`ul` list item 2</li>
    </ul>

    <ol>
     <li>`ol` list item 1</li>
     <li>`ol` list item 2</li>
    </ol>

    <table>
     <thead>
      <tr>
       <th>Table Item</th>
       <th>Description</th>
      </tr>
     </thead>
     <tbody>
      <tr>
       <td>One</td>
       <td>One is the spelling of the number `1`.</td>
      </tr>
      <tr>
       <td>Two</td>
       <td>Two is the spelling of the number `2`.</td>
      </tr>
     </tbody>
    </table>

    <pre>
     <code>var one = 1;
     var two = 2;

     function simpleMath(x, y) {
      return x + y;
     }
     console.log(simpleMath(one, two));</code>
    </pre>
    ```
```

### Code Block Conversions

For more see [code-blocks-to-html.md](references/code-blocks-to-html.md)

```text

    ```markdown
    your code here
    ```

    ```html
    <pre><code class="language-md">
    your code here
    </code></pre>
    ```

    ```js
    console.log("Hello world");
    ```

    ```html
    <pre><code class="language-js">
    console.log("Hello world");
    </code></pre>
    ```

    ```markdown
      ```

      ```
      visible backticks
      ```

      ```
    ```

    ```html
      <pre><code>
      ```

      visible backticks

      ```
      </code></pre>
    ```
```

### Collapsed Section Conversions

For more see [collapsed-sections-to-html.md](references/collapsed-sections-to-html.md)

```text
    ```markdown
    <details>
    <summary>More info</summary>

    ### Header inside

    - Lists
    - **Formatting**
    - Code blocks

        ```js
        console.log("Hello");
        ```

    </details>
    ```

    ```html
    <details>
    <summary>More info</summary>

    <h3>Header inside</h3>

    <ul>
     <li>Lists</li>
     <li><strong>Formatting</strong></li>
     <li>Code blocks</li>
    </ul>

    <pre>
     <code class="language-js">console.log("Hello");</code>
    </pre>

    </details>
    ```
```

### Mathematical Expression Conversions

For more see [writing-mathematical-expressions-to-html.md](references/writing-mathematical-expressions-to-html.md)

```text
    ```markdown
    This sentence uses `$` delimiters to show math inline: $\sqrt{3x-1}+(1+x)^2$
    ```

    ```html
    <p>This sentence uses <code>$</code> delimiters to show math inline:
     <math-renderer><math xmlns="http://www.w3.org/1998/Math/MathML">
      <msqrt><mn>3</mn><mi>x</mi><mo>−</mo><mn>1</mn></msqrt>
      <mo>+</mo><mo>(</mo><mn>1</mn><mo>+</mo><mi>x</mi>
      <msup><mo>)</mo><mn>2</mn></msup>
     </math>
    </math-renderer>
    </p>
    ```

    ```markdown
    **The Cauchy-Schwarz Inequality**\
    $$\left( \sum_{k=1}^n a_k b_k \right)^2 \leq \left( \sum_{k=1}^n a_k^2 \right) \left( \sum_{k=1}^n b_k^2 \right)$$
    ```

    ```html
    <p><strong>The Cauchy-Schwarz Inequality</strong><br>
     <math-renderer>
      <math xmlns="http://www.w3.org/1998/Math/MathML">
       <msup>
        <mrow><mo>(</mo>
         <munderover><mo data-mjx-texclass="OP">∑</mo>
          <mrow><mi>k</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi>
         </munderover>
         <msub><mi>a</mi><mi>k</mi></msub>
         <msub><mi>b</mi><mi>k</mi></msub>
         <mo>)</mo>
        </mrow>
        <mn>2</mn>
       </msup>
       <mo>≤</mo>
       <mrow><mo>(</mo>
        <munderover><mo>∑</mo>
         <mrow><mi>k</mi><mo>=</mo><mn>1</mn></mrow>
         <mi>n</mi>
        </munderover>
        <msubsup><mi>a</mi><mi>k</mi><mn>2</mn></msubsup>
        <mo>)</mo>
       </mrow>
       <mrow><mo>(</mo>
         <munderover><mo>∑</mo>
          <mrow><mi>k</mi><mo>=</mo><mn>1</mn></mrow>
          <mi>n</mi>
         </munderover>
         <msubsup><mi>b</mi><mi>k</mi><mn>2</mn></msubsup>
         <mo>)</mo>
       </mrow>
      </math>
     </math-renderer></p>
    ```
```

### Table Conversions

For more see [tables-to-html.md](references/tables-to-html.md)

```text
    ```markdown
    | First Header  | Second Header |
    | ------------- | ------------- |
    | Content Cell  | Content Cell  |
    | Content Cell  | Content Cell  |
    ```

    ```html
    <table>
     <thead><tr><th>First Header</th><th>Second Header</th></tr></thead>
     <tbody>
      <tr><td>Content Cell</td><td>Content Cell</td></tr>
      <tr><td>Content Cell</td><td>Content Cell</td></tr>
     </tbody>
    </table>
    ```

    ```markdown
    | Left-aligned | Center-aligned | Right-aligned |
    | :---         |     :---:      |          ---: |
    | git status   | git status     | git status    |
    | git diff     | git diff       | git diff      |
    ```

    ```html
    <table>
      <thead>
       <tr>
        <th align="left">Left-aligned</th>
        <th align="center">Center-aligned</th>
        <th align="right">Right-aligned</th>
       </tr>
      </thead>
      <tbody>
       <tr>
        <td align="left">git status</td>
        <td align="center">git status</td>
        <td align="right">git status</td>
       </tr>
       <tr>
        <td align="left">git diff</td>
        <td align="center">git diff</td>
        <td align="right">git diff</td>
       </tr>
      </tbody>
    </table>
    ```
```

## Working with [`markedJS/marked`](references/marked.md)

### Prerequisites

- Node.js installed (for CLI or programmatic usage)
- Install marked globally for CLI: `npm install -g marked`
- Or install locally: `npm install marked`

### Quick Conversion Methods

See [marked.md](references/marked.md) **Quick Conversion Methods**

### Step-by-Step Workflows

See [marked.md](references/marked.md) **Step-by-Step Workflows**

### CLI Configuration

### Using Config Files

Create `~/.marked.json` for persistent options:

```json
{
  "gfm": true,
  "breaks": true
}
```

Or use a custom config:

```bash
marked -i input.md -o output.html -c config.json
```

### CLI Options Reference

| Option | Description |
|--------|-------------|
| `-i, --input <file>` | Input Markdown file |
| `-o, --output <file>` | Output HTML file |
| `-s, --string <string>` | Parse string instead of file |
| `-c, --config <file>` | Use custom config file |
| `--gfm` | Enable GitHub Flavored Markdown |
| `--breaks` | Convert newlines to `<br>` |
| `--help` | Show all options |

### Security Warning

⚠️ **Marked does NOT sanitize output HTML.** For untrusted input, use a sanitizer:

```javascript
import { marked } from ''marked'';
import DOMPurify from ''dompurify'';

const unsafeHtml = marked.parse(untrustedMarkdown);
const safeHtml = DOMPurify.sanitize(unsafeHtml);
```

Recommended sanitizers:

- [DOMPurify](https://github.com/cure53/DOMPurify) (recommended)
- [sanitize-html](https://github.com/apostrophecms/sanitize-html)
- [js-xss](https://github.com/leizongmin/js-xss)

### Supported Markdown Flavors

| Flavor | Support |
|--------|---------|
| Original Markdown | 100% |
| CommonMark 0.31 | 98% |
| GitHub Flavored Markdown | 97% |

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Special characters at file start | Strip zero-width chars: `content.replace(/^[\u200B\u200C\u200D\uFEFF]/,"")` |
| Code blocks not highlighting | Add a syntax highlighter like highlight.js |
| Tables not rendering | Ensure `gfm: true` option is set |
| Line breaks ignored | Set `breaks: true` in options |
| XSS vulnerability concerns | Use DOMPurify to sanitize output |

## Working with [`pandoc`](references/pandoc.md)

### Prerequisites

- Pandoc installed (download from <https://pandoc.org/installing.html>)
- For PDF output: LaTeX installation (MacTeX on macOS, MiKTeX on Windows, texlive on Linux)
- Terminal/command prompt access

### Quick Conversion Methods

#### Method 1: CLI Basic Conversion

```bash
# Convert markdown to HTML
pandoc input.md -o output.html

# Convert with standalone document (includes header/footer)
pandoc input.md -s -o output.html

# Explicit format specification
pandoc input.md -f markdown -t html -s -o output.html
```

#### Method 2: Filter Mode (Interactive)

```bash
# Start pandoc as a filter
pandoc

# Type markdown, then Ctrl-D (Linux/macOS) or Ctrl-Z+Enter (Windows)
Hello *pandoc*!
# Output: <p>Hello <em>pandoc</em>!</p>
```

#### Method 3: Format Conversion

```bash
# HTML to Markdown
pandoc -f html -t markdown input.html -o output.md

# Markdown to LaTeX
pandoc input.md -s -o output.tex

# Markdown to PDF (requires LaTeX)
pandoc input.md -s -o output.pdf

# Markdown to Word
pandoc input.md -s -o output.docx
```

### CLI Configuration

| Option | Description |
|--------|-------------|
| `-f, --from <format>` | Input format (markdown, html, latex, etc.) |
| `-t, --to <format>` | Output format (html, latex, pdf, docx, etc.) |
| `-s, --standalone` | Produce standalone document with header/footer |
| `-o, --output <file>` | Output file (inferred from extension) |
| `--mathml` | Convert TeX math to MathML |
| `--metadata title="Title"` | Set document metadata |
| `--toc` | Include table of contents |
| `--template <file>` | Use custom template |
| `--help` | Show all options |

### Security Warning

⚠️ **Pandoc processes input faithfully.** When converting untrusted markdown:

- Use `--sandbox` mode to disable external file access
- Validate input before processing
- Sanitize HTML output if displayed in browsers

```bash
# Run in sandbox mode for untrusted input
pandoc --sandbox input.md -o output.html
```

### Supported Markdown Flavors

| Flavor | Support |
|--------|---------|
| Pandoc Markdown | 100% (native) |
| CommonMark | Full (use `-f commonmark`) |
| GitHub Flavored Markdown | Full (use `-f gfm`) |
| MultiMarkdown | Partial |

### Troubleshooting

| Issue | Solution |
|-------|----------|
| PDF generation fails | Install LaTeX (MacTeX, MiKTeX, or texlive) |
| Encoding issues on Windows | Run `chcp 65001` before using pandoc |
| Missing standalone headers | Add `-s` flag for complete documents |
| Math not rendering | Use `--mathml` or `--mathjax` option |
| Tables not rendering | Ensure proper table syntax with pipes and dashes |

## Working with [`gomarkdown/markdown`](references/gomarkdown.md)

### Prerequisites

- Go 1.18 or higher installed
- Install the library: `go get github.com/gomarkdown/markdown`
- For CLI tool: `go install github.com/gomarkdown/mdtohtml@latest`

### Quick Conversion Methods

#### Method 1: Simple Conversion (Go)

```go
package main

import (
    "fmt"
    "github.com/gomarkdown/markdown"
)

func main() {
    md := []byte("# Hello World\n\nThis is **bold** text.")
    html := markdown.ToHTML(md, nil, nil)
    fmt.Println(string(html))
}
```

#### Method 2: CLI Tool

```bash
# Install mdtohtml
go install github.com/gomarkdown/mdtohtml@latest

# Convert file
mdtohtml input.md output.html

# Convert file (output to stdout)
mdtohtml input.md
```

#### Method 3: Custom Parser and Renderer

```go
package main

import (
    "github.com/gomarkdown/markdown"
    "github.com/gomarkdown/markdown/html"
    "github.com/gomarkdown/markdown/parser"
)

func mdToHTML(md []byte) []byte {
    // Create parser with extensions
    extensions := parser.CommonExtensions | parser.AutoHeadingIDs | parser.NoEmptyLineBeforeBlock
    p := parser.NewWithExtensions(extensions)
    doc := p.Parse(md)

    // Create HTML renderer with extensions
    htmlFlags := html.CommonFlags | html.HrefTargetBlank
    opts := html.RendererOptions{Flags: htmlFlags}
    renderer := html.NewRenderer(opts)

    return markdown.Render(doc, renderer)
}
```

### CLI Configuration

The `mdtohtml` CLI tool has minimal options:

```bash
mdtohtml input-file [output-file]
```

For advanced configuration, use the Go library programmatically with parser and renderer options:

| Parser Extension | Description |
|------------------|-------------|
| `parser.CommonExtensions` | Tables, fenced code, autolinks, strikethrough, etc. |
| `parser.AutoHeadingIDs` | Generate IDs for headings |
| `parser.NoEmptyLineBeforeBlock` | No blank line needed before blocks |
| `parser.MathJax` | MathJax support for LaTeX math |

| HTML Flag | Description |
|-----------|-------------|
| `html.CommonFlags` | Common HTML output flags |
| `html.HrefTargetBlank` | Add `target="_blank"` to links |
| `html.CompletePage` | Generate complete HTML page |
| `html.UseXHTML` | Generate XHTML output |

### Security Warning

⚠️ **gomarkdown does NOT sanitize output HTML.** For untrusted input, use Bluemonday:

```go
import (
    "github.com/microcosm-cc/bluemonday"
    "github.com/gomarkdown/markdown"
)

maybeUnsafeHTML := markdown.ToHTML(md, nil, nil)
html := bluemonday.UGCPolicy().SanitizeBytes(maybeUnsafeHTML)
```

Recommended sanitizer: [Bluemonday](https://github.com/microcosm-cc/bluemonday)

### Supported Markdown Flavors

| Flavor | Support |
|--------|---------|
| Original Markdown | 100% |
| CommonMark | High (with extensions) |
| GitHub Flavored Markdown | High (tables, fenced code, strikethrough) |
| MathJax/LaTeX Math | Supported via extension |
| Mmark | Supported |

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Windows/Mac newlines not parsed | Use `parser.NormalizeNewlines(input)` |
| Tables not rendering | Enable `parser.Tables` extension |
| Code blocks without highlighting | Integrate with syntax highlighter like Chroma |
| Math not rendering | Enable `parser.MathJax` extension |
| XSS vulnerabilities | Use Bluemonday to sanitize output |

## Working with [`jekyll`](references/jekyll.md)

### Prerequisites

- Ruby version 2.7.0 or higher
- RubyGems
- GCC and Make (for native extensions)
- Install Jekyll and Bundler: `gem install jekyll bundler`

### Quick Conversion Methods

#### Method 1: Create New Site

```bash
# Create a new Jekyll site
jekyll new myblog

# Change to site directory
cd myblog

# Build and serve locally
bundle exec jekyll serve

# Access at http://localhost:4000
```

#### Method 2: Build Static Site

```bash
# Build site to _site directory
bundle exec jekyll build

# Build with production environment
JEKYLL_ENV=production bundle exec jekyll build
```

#### Method 3: Live Reload Development

```bash
# Serve with live reload
bundle exec jekyll serve --livereload

# Serve with drafts
bundle exec jekyll serve --drafts
```

### CLI Configuration

| Command | Description |
|---------|-------------|
| `jekyll new <path>` | Create new Jekyll site |
| `jekyll build` | Build site to `_site` directory |
| `jekyll serve` | Build and serve locally |
| `jekyll clean` | Remove generated files |
| `jekyll doctor` | Check for configuration issues |

| Serve Options | Description |
|---------------|-------------|
| `--livereload` | Reload browser on changes |
| `--drafts` | Include draft posts |
| `--port <port>` | Set server port (default: 4000) |
| `--host <host>` | Set server host (default: localhost) |
| `--baseurl <url>` | Set base URL |

### Security Warning

⚠️ **Jekyll security considerations:**

- Avoid using `safe: false` in production
- Use `exclude` in `_config.yml` to prevent sensitive files from being published
- Sanitize user-generated content if accepting external input
- Keep Jekyll and plugins updated

```yaml
# _config.yml security settings
exclude:
  - Gemfile
  - Gemfile.lock
  - node_modules
  - vendor
```

### Supported Markdown Flavors

| Flavor | Support |
|--------|---------|
| Kramdown (default) | 100% |
| CommonMark | Via plugin (jekyll-commonmark) |
| GitHub Flavored Markdown | Via plugin (jekyll-commonmark-ghpages) |
| RedCarpet | Via plugin (deprecated) |

Configure markdown processor in `_config.yml`:

```yaml
markdown: kramdown
kramdown:
  input: GFM
  syntax_highlighter: rouge
```

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Ruby 3.0+ fails to serve | Run `bundle add webrick` |
| Gem dependency errors | Run `bundle install` |
| Slow builds | Use `--incremental` flag |
| Liquid syntax errors | Check for unescaped `{` in content |
| Plugin not loading | Add to `_config.yml` plugins list |

## Working with [`hugo`](references/hugo.md)

### Prerequisites

- Hugo installed (download from <https://gohugo.io/installation/>)
- Git (recommended for themes and modules)
- Go (optional, for Hugo Modules)

### Quick Conversion Methods

#### Method 1: Create New Site

```bash
# Create a new Hugo site
hugo new site mysite

# Change to site directory
cd mysite

# Add a theme
git init
git submodule add https://github.com/theNewDynamic/gohugo-theme-ananke themes/ananke
echo "theme = ''ananke''" >> hugo.toml

# Create content
hugo new content posts/my-first-post.md

# Start development server
hugo server -D
```

#### Method 2: Build Static Site

```bash
# Build site to public directory
hugo

# Build with minification
hugo --minify

# Build for specific environment
hugo --environment production
```

#### Method 3: Development Server

```bash
# Start server with drafts
hugo server -D

# Start with live reload and bind to all interfaces
hugo server --bind 0.0.0.0 --baseURL http://localhost:1313/

# Start with specific port
hugo server --port 8080
```

### CLI Configuration

| Command | Description |
|---------|-------------|
| `hugo new site <name>` | Create new Hugo site |
| `hugo new content <path>` | Create new content file |
| `hugo` | Build site to `public` directory |
| `hugo server` | Start development server |
| `hugo mod init` | Initialize Hugo Modules |

| Build Options | Description |
|---------------|-------------|
| `-D, --buildDrafts` | Include draft content |
| `-E, --buildExpired` | Include expired content |
| `-F, --buildFuture` | Include future-dated content |
| `--minify` | Minify output |
| `--gc` | Run garbage collection after build |
| `-d, --destination <path>` | Output directory |

| Server Options | Description |
|----------------|-------------|
| `--bind <ip>` | Interface to bind to |
| `-p, --port <port>` | Port number (default: 1313) |
| `--liveReloadPort <port>` | Live reload port |
| `--disableLiveReload` | Disable live reload |
| `--navigateToChanged` | Navigate to changed content |

### Security Warning

⚠️ **Hugo security considerations:**

- Configure security policy in `hugo.toml` for external commands
- Use `--enableGitInfo` carefully with public repositories
- Validate shortcode parameters for user-generated content

```toml
# hugo.toml security settings
[security]
  enableInlineShortcodes = false
  [security.exec]
    allow = [''^go$'', ''^npx$'', ''^postcss$'']
  [security.funcs]
    getenv = [''^HUGO_'', ''^CI$'']
  [security.http]
    methods = [''(?i)GET|POST'']
    urls = [''.*'']
```

### Supported Markdown Flavors

| Flavor | Support |
|--------|---------|
| Goldmark (default) | 100% (CommonMark compliant) |
| GitHub Flavored Markdown | Full (tables, strikethrough, autolinks) |
| CommonMark | 100% |
| Blackfriday (legacy) | Deprecated, not recommended |

Configure markdown in `hugo.toml`:

```toml
[markup]
  [markup.goldmark]
    [markup.goldmark.extensions]
      definitionList = true
      footnote = true
      linkify = true
      strikethrough = true
      table = true
      taskList = true
    [markup.goldmark.renderer]
      unsafe = false  # Set true to allow raw HTML
```

### Troubleshooting

| Issue | Solution |
|-------|----------|
| "Page not found" on paths | Check `baseURL` in config |
| Theme not loading | Verify theme in `themes/` or Hugo Modules |
| Slow builds | Use `--templateMetrics` to identify bottlenecks |
| Raw HTML not rendering | Set `unsafe = true` in goldmark config |
| Images not loading | Check `static/` folder structure |
| Module errors | Run `hugo mod tidy` |

## References

### Writing and Styling Markdown

- [basic-markdown.md](references/basic-markdown.md)
- [code-blocks.md](references/code-blocks.md)
- [collapsed-sections.md](references/collapsed-sections.md)
- [tables.md](references/tables.md)
- [writing-mathematical-expressions.md](references/writing-mathematical-expressions.md)
- Markdown Guide: <https://www.markdownguide.org/basic-syntax/>
- Styling Markdown: <https://github.com/sindresorhus/github-markdown-css>

### [`markedJS/marked`](references/marked.md)

- Official documentation: <https://marked.js.org/>
- Advanced options: <https://marked.js.org/using_advanced>
- Extensibility: <https://marked.js.org/using_pro>
- GitHub repository: <https://github.com/markedjs/marked>

### [`pandoc`](references/pandoc.md)

- Getting started: <https://pandoc.org/getting-started.html>
- Official documentation: <https://pandoc.org/MANUAL.html>
- Extensibility: <https://pandoc.org/extras.html>
- GitHub repository: <https://github.com/jgm/pandoc>

### [`gomarkdown/markdown`](references/gomarkdown.md)

- Official documentation: <https://pkg.go.dev/github.com/gomarkdown/markdown>
- Advanced configuration: <https://pkg.go.dev/github.com/gomarkdown/markdown@v0.0.0-20250810172220-2e2c11897d1a/html>
- Markdown processing: <https://blog.kowalczyk.info/article/cxn3/advanced-markdown-processing-in-go.html>
- GitHub repository: <https://github.com/gomarkdown/markdown>

### [`jekyll`](references/jekyll.md)

- Official documentation: <https://jekyllrb.com/docs/>
- Configuration options: <https://jekyllrb.com/docs/configuration/options/>
- Plugins: <https://jekyllrb.com/docs/plugins/>
  - [Installation](https://jekyllrb.com/docs/plugins/installation/)
  - [Generators](https://jekyllrb.com/docs/plugins/generators/)
  - [Converters](https://jekyllrb.com/docs/plugins/converters/)
  - [Commands](https://jekyllrb.com/docs/plugins/commands/)
  - [Tags](https://jekyllrb.com/docs/plugins/tags/)
  - [Filters](https://jekyllrb.com/docs/plugins/filters/)
  - [Hooks](https://jekyllrb.com/docs/plugins/hooks/)
- GitHub repository: <https://github.com/jekyll/jekyll>

### [`hugo`](references/hugo.md)

- Official documentation: <https://gohugo.io/documentation/>
- All Settings: <https://gohugo.io/configuration/all/>
- Editor Plugins: <https://gohugo.io/tools/editors/>
- GitHub repository: <https://github.com/gohugoio/hugo>
' WHERE slug = 'github-markdown-to-html';
UPDATE skills SET content = '---
name: refactor
description: ''Surgical code refactoring to improve maintainability without changing behavior. Covers extracting functions, renaming variables, breaking down god functions, improving type safety, eliminating code smells, and applying design patterns. Less drastic than repo-rebuilder; use for gradual improvements.''
license: MIT
---

# Refactor

## Overview

Improve code structure and readability without changing external behavior. Refactoring is gradual evolution, not revolution. Use this for improving existing code, not rewriting from scratch.

## When to Use

Use this skill when:

- Code is hard to understand or maintain
- Functions/classes are too large
- Code smells need addressing
- Adding features is difficult due to code structure
- User asks "clean up this code", "refactor this", "improve this"

---

## Refactoring Principles

### The Golden Rules

1. **Behavior is preserved** - Refactoring doesn''t change what the code does, only how
2. **Small steps** - Make tiny changes, test after each
3. **Version control is your friend** - Commit before and after each safe state
4. **Tests are essential** - Without tests, you''re not refactoring, you''re editing
5. **One thing at a time** - Don''t mix refactoring with feature changes

### When NOT to Refactor

```
- Code that works and won''t change again (if it ain''t broke...)
- Critical production code without tests (add tests first)
- When you''re under a tight deadline
- "Just because" - need a clear purpose
```

---

## Common Code Smells & Fixes

### 1. Long Method/Function

```diff
# BAD: 200-line function that does everything
- async function processOrder(orderId) {
-   // 50 lines: fetch order
-   // 30 lines: validate order
-   // 40 lines: calculate pricing
-   // 30 lines: update inventory
-   // 20 lines: create shipment
-   // 30 lines: send notifications
- }

# GOOD: Broken into focused functions
+ async function processOrder(orderId) {
+   const order = await fetchOrder(orderId);
+   validateOrder(order);
+   const pricing = calculatePricing(order);
+   await updateInventory(order);
+   const shipment = await createShipment(order);
+   await sendNotifications(order, pricing, shipment);
+   return { order, pricing, shipment };
+ }
```

### 2. Duplicated Code

```diff
# BAD: Same logic in multiple places
- function calculateUserDiscount(user) {
-   if (user.membership === ''gold'') return user.total * 0.2;
-   if (user.membership === ''silver'') return user.total * 0.1;
-   return 0;
- }
-
- function calculateOrderDiscount(order) {
-   if (order.user.membership === ''gold'') return order.total * 0.2;
-   if (order.user.membership === ''silver'') return order.total * 0.1;
-   return 0;
- }

# GOOD: Extract common logic
+ function getMembershipDiscountRate(membership) {
+   const rates = { gold: 0.2, silver: 0.1 };
+   return rates[membership] || 0;
+ }
+
+ function calculateUserDiscount(user) {
+   return user.total * getMembershipDiscountRate(user.membership);
+ }
+
+ function calculateOrderDiscount(order) {
+   return order.total * getMembershipDiscountRate(order.user.membership);
+ }
```

### 3. Large Class/Module

```diff
# BAD: God object that knows too much
- class UserManager {
-   createUser() { /* ... */ }
-   updateUser() { /* ... */ }
-   deleteUser() { /* ... */ }
-   sendEmail() { /* ... */ }
-   generateReport() { /* ... */ }
-   handlePayment() { /* ... */ }
-   validateAddress() { /* ... */ }
-   // 50 more methods...
- }

# GOOD: Single responsibility per class
+ class UserService {
+   create(data) { /* ... */ }
+   update(id, data) { /* ... */ }
+   delete(id) { /* ... */ }
+ }
+
+ class EmailService {
+   send(to, subject, body) { /* ... */ }
+ }
+
+ class ReportService {
+   generate(type, params) { /* ... */ }
+ }
+
+ class PaymentService {
+   process(amount, method) { /* ... */ }
+ }
```

### 4. Long Parameter List

```diff
# BAD: Too many parameters
- function createUser(email, password, name, age, address, city, country, phone) {
-   /* ... */
- }

# GOOD: Group related parameters
+ interface UserData {
+   email: string;
+   password: string;
+   name: string;
+   age?: number;
+   address?: Address;
+   phone?: string;
+ }
+
+ function createUser(data: UserData) {
+   /* ... */
+ }

# EVEN BETTER: Use builder pattern for complex construction
+ const user = UserBuilder
+   .email(''test@example.com'')
+   .password(''secure123'')
+   .name(''Test User'')
+   .address(address)
+   .build();
```

### 5. Feature Envy

```diff
# BAD: Method that uses another object''s data more than its own
- class Order {
-   calculateDiscount(user) {
-     if (user.membershipLevel === ''gold'') {
+       return this.total * 0.2;
+     }
+     if (user.accountAge > 365) {
+       return this.total * 0.1;
+     }
+     return 0;
+   }
+ }

# GOOD: Move logic to the object that owns the data
+ class User {
+   getDiscountRate(orderTotal) {
+     if (this.membershipLevel === ''gold'') return 0.2;
+     if (this.accountAge > 365) return 0.1;
+     return 0;
+   }
+ }
+
+ class Order {
+   calculateDiscount(user) {
+     return this.total * user.getDiscountRate(this.total);
+   }
+ }
```

### 6. Primitive Obsession

```diff
# BAD: Using primitives for domain concepts
- function sendEmail(to, subject, body) { /* ... */ }
- sendEmail(''user@example.com'', ''Hello'', ''...'');

- function createPhone(country, number) {
-   return `${country}-${number}`;
- }

# GOOD: Use domain types
+ class Email {
+   private constructor(public readonly value: string) {
+     if (!Email.isValid(value)) throw new Error(''Invalid email'');
+   }
+   static create(value: string) { return new Email(value); }
+   static isValid(email: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
+ }
+
+ class PhoneNumber {
+   constructor(
+     public readonly country: string,
+     public readonly number: string
+   ) {
+     if (!PhoneNumber.isValid(country, number)) throw new Error(''Invalid phone'');
+   }
+   toString() { return `${this.country}-${this.number}`; }
+   static isValid(country: string, number: string) { /* ... */ }
+ }
+
+ // Usage
+ const email = Email.create(''user@example.com'');
+ const phone = new PhoneNumber(''1'', ''555-1234'');
```

### 7. Magic Numbers/Strings

```diff
# BAD: Unexplained values
- if (user.status === 2) { /* ... */ }
- const discount = total * 0.15;
- setTimeout(callback, 86400000);

# GOOD: Named constants
+ const UserStatus = {
+   ACTIVE: 1,
+   INACTIVE: 2,
+   SUSPENDED: 3
+ } as const;
+
+ const DISCOUNT_RATES = {
+   STANDARD: 0.1,
+   PREMIUM: 0.15,
+   VIP: 0.2
+ } as const;
+
+ const ONE_DAY_MS = 24 * 60 * 60 * 1000;
+
+ if (user.status === UserStatus.INACTIVE) { /* ... */ }
+ const discount = total * DISCOUNT_RATES.PREMIUM;
+ setTimeout(callback, ONE_DAY_MS);
```

### 8. Nested Conditionals

```diff
# BAD: Arrow code
- function process(order) {
-   if (order) {
-     if (order.user) {
-       if (order.user.isActive) {
-         if (order.total > 0) {
-           return processOrder(order);
+         } else {
+           return { error: ''Invalid total'' };
+         }
+       } else {
+         return { error: ''User inactive'' };
+       }
+     } else {
+       return { error: ''No user'' };
+     }
+   } else {
+     return { error: ''No order'' };
+   }
+ }

# GOOD: Guard clauses / early returns
+ function process(order) {
+   if (!order) return { error: ''No order'' };
+   if (!order.user) return { error: ''No user'' };
+   if (!order.user.isActive) return { error: ''User inactive'' };
+   if (order.total <= 0) return { error: ''Invalid total'' };
+   return processOrder(order);
+ }

# EVEN BETTER: Using Result type
+ function process(order): Result<ProcessedOrder, Error> {
+   return Result.combine([
+     validateOrderExists(order),
+     validateUserExists(order),
+     validateUserActive(order.user),
+     validateOrderTotal(order)
+   ]).flatMap(() => processOrder(order));
+ }
```

### 9. Dead Code

```diff
# BAD: Unused code lingers
- function oldImplementation() { /* ... */ }
- const DEPRECATED_VALUE = 5;
- import { unusedThing } from ''./somewhere'';
- // Commented out code
- // function oldCode() { /* ... */ }

# GOOD: Remove it
+ // Delete unused functions, imports, and commented code
+ // If you need it again, git history has it
```

### 10. Inappropriate Intimacy

```diff
# BAD: One class reaches deep into another
- class OrderProcessor {
-   process(order) {
-     order.user.profile.address.street;  // Too intimate
-     order.repository.connection.config;  // Breaking encapsulation
+   }
+ }

# GOOD: Ask, don''t tell
+ class OrderProcessor {
+   process(order) {
+     order.getShippingAddress();  // Order knows how to get it
+     order.save();  // Order knows how to save itself
+   }
+ }
```

---

## Extract Method Refactoring

### Before and After

```diff
# Before: One long function
- function printReport(users) {
-   console.log(''USER REPORT'');
-   console.log(''============'');
-   console.log('''');
-   console.log(`Total users: ${users.length}`);
-   console.log('''');
-   console.log(''ACTIVE USERS'');
-   console.log(''------------'');
-   const active = users.filter(u => u.isActive);
-   active.forEach(u => {
-     console.log(`- ${u.name} (${u.email})`);
-   });
-   console.log('''');
-   console.log(`Active: ${active.length}`);
-   console.log('''');
-   console.log(''INACTIVE USERS'');
-   console.log(''--------------'');
-   const inactive = users.filter(u => !u.isActive);
-   inactive.forEach(u => {
-     console.log(`- ${u.name} (${u.email})`);
-   });
-   console.log('''');
-   console.log(`Inactive: ${inactive.length}`);
- }

# After: Extracted methods
+ function printReport(users) {
+   printHeader(''USER REPORT'');
+   console.log(`Total users: ${users.length}\n`);
+   printUserSection(''ACTIVE USERS'', users.filter(u => u.isActive));
+   printUserSection(''INACTIVE USERS'', users.filter(u => !u.isActive));
+ }
+
+ function printHeader(title) {
+   const line = ''=''.repeat(title.length);
+   console.log(title);
+   console.log(line);
+   console.log('''');
+ }
+
+ function printUserSection(title, users) {
+   console.log(title);
+   console.log(''-''.repeat(title.length));
+   users.forEach(u => console.log(`- ${u.name} (${u.email})`));
+   console.log('''');
+   console.log(`${title.split('' '')[0]}: ${users.length}`);
+   console.log('''');
+ }
```

---

## Introducing Type Safety

### From Untyped to Typed

```diff
# Before: No types
- function calculateDiscount(user, total, membership, date) {
-   if (membership === ''gold'' && date.getDay() === 5) {
-     return total * 0.25;
-   }
-   if (membership === ''gold'') return total * 0.2;
-   return total * 0.1;
- }

# After: Full type safety
+ type Membership = ''bronze'' | ''silver'' | ''gold'';
+
+ interface User {
+   id: string;
+   name: string;
+   membership: Membership;
+ }
+
+ interface DiscountResult {
+   original: number;
+   discount: number;
+   final: number;
+   rate: number;
+ }
+
+ function calculateDiscount(
+   user: User,
+   total: number,
+   date: Date = new Date()
+ ): DiscountResult {
+   if (total < 0) throw new Error(''Total cannot be negative'');
+
+   let rate = 0.1; // Default bronze
+
+   if (user.membership === ''gold'' && date.getDay() === 5) {
+     rate = 0.25; // Friday bonus for gold
+   } else if (user.membership === ''gold'') {
+     rate = 0.2;
+   } else if (user.membership === ''silver'') {
+     rate = 0.15;
+   }
+
+   const discount = total * rate;
+
+   return {
+     original: total,
+     discount,
+     final: total - discount,
+     rate
+   };
+ }
```

---

## Design Patterns for Refactoring

### Strategy Pattern

```diff
# Before: Conditional logic
- function calculateShipping(order, method) {
-   if (method === ''standard'') {
-     return order.total > 50 ? 0 : 5.99;
-   } else if (method === ''express'') {
-     return order.total > 100 ? 9.99 : 14.99;
+   } else if (method === ''overnight'') {
+     return 29.99;
+   }
+ }

# After: Strategy pattern
+ interface ShippingStrategy {
+   calculate(order: Order): number;
+ }
+
+ class StandardShipping implements ShippingStrategy {
+   calculate(order: Order) {
+     return order.total > 50 ? 0 : 5.99;
+   }
+ }
+
+ class ExpressShipping implements ShippingStrategy {
+   calculate(order: Order) {
+     return order.total > 100 ? 9.99 : 14.99;
+   }
+ }
+
+ class OvernightShipping implements ShippingStrategy {
+   calculate(order: Order) {
+     return 29.99;
+   }
+ }
+
+ function calculateShipping(order: Order, strategy: ShippingStrategy) {
+   return strategy.calculate(order);
+ }
```

### Chain of Responsibility

```diff
# Before: Nested validation
- function validate(user) {
-   const errors = [];
-   if (!user.email) errors.push(''Email required'');
+   else if (!isValidEmail(user.email)) errors.push(''Invalid email'');
+   if (!user.name) errors.push(''Name required'');
+   if (user.age < 18) errors.push(''Must be 18+'');
+   if (user.country === ''blocked'') errors.push(''Country not supported'');
+   return errors;
+ }

# After: Chain of responsibility
+ abstract class Validator {
+   abstract validate(user: User): string | null;
+   setNext(validator: Validator): Validator {
+     this.next = validator;
+     return validator;
+   }
+   validate(user: User): string | null {
+     const error = this.doValidate(user);
+     if (error) return error;
+     return this.next?.validate(user) ?? null;
+   }
+ }
+
+ class EmailRequiredValidator extends Validator {
+   doValidate(user: User) {
+     return !user.email ? ''Email required'' : null;
+   }
+ }
+
+ class EmailFormatValidator extends Validator {
+   doValidate(user: User) {
+     return user.email && !isValidEmail(user.email) ? ''Invalid email'' : null;
+   }
+ }
+
+ // Build the chain
+ const validator = new EmailRequiredValidator()
+   .setNext(new EmailFormatValidator())
+   .setNext(new NameRequiredValidator())
+   .setNext(new AgeValidator())
+   .setNext(new CountryValidator());
```

---

## Refactoring Steps

### Safe Refactoring Process

```
1. PREPARE
   - Ensure tests exist (write them if missing)
   - Commit current state
   - Create feature branch

2. IDENTIFY
   - Find the code smell to address
   - Understand what the code does
   - Plan the refactoring

3. REFACTOR (small steps)
   - Make one small change
   - Run tests
   - Commit if tests pass
   - Repeat

4. VERIFY
   - All tests pass
   - Manual testing if needed
   - Performance unchanged or improved

5. CLEAN UP
   - Update comments
   - Update documentation
   - Final commit
```

---

## Refactoring Checklist

### Code Quality

- [ ] Functions are small (< 50 lines)
- [ ] Functions do one thing
- [ ] No duplicated code
- [ ] Descriptive names (variables, functions, classes)
- [ ] No magic numbers/strings
- [ ] Dead code removed

### Structure

- [ ] Related code is together
- [ ] Clear module boundaries
- [ ] Dependencies flow in one direction
- [ ] No circular dependencies

### Type Safety

- [ ] Types defined for all public APIs
- [ ] No `any` types without justification
- [ ] Nullable types explicitly marked

### Testing

- [ ] Refactored code is tested
- [ ] Tests cover edge cases
- [ ] All tests pass

---

## Common Refactoring Operations

| Operation                                     | Description                           |
| --------------------------------------------- | ------------------------------------- |
| Extract Method                                | Turn code fragment into method        |
| Extract Class                                 | Move behavior to new class            |
| Extract Interface                             | Create interface from implementation  |
| Inline Method                                 | Move method body back to caller       |
| Inline Class                                  | Move class behavior to caller         |
| Pull Up Method                                | Move method to superclass             |
| Push Down Method                              | Move method to subclass               |
| Rename Method/Variable                        | Improve clarity                       |
| Introduce Parameter Object                    | Group related parameters              |
| Replace Conditional with Polymorphism         | Use polymorphism instead of switch/if |
| Replace Magic Number with Constant            | Named constants                       |
| Decompose Conditional                         | Break complex conditions              |
| Consolidate Conditional                       | Combine duplicate conditions          |
| Replace Nested Conditional with Guard Clauses | Early returns                         |
| Introduce Null Object                         | Eliminate null checks                 |
| Replace Type Code with Class/Enum             | Strong typing                         |
| Replace Inheritance with Delegation           | Composition over inheritance          |
' WHERE slug = 'github-refactor';
UPDATE skills SET content = '---
name: powerbi-modeling
description: ''Power BI semantic modeling assistant for building optimized data models. Use when working with Power BI semantic models, creating measures, designing star schemas, configuring relationships, implementing RLS, or optimizing model performance. Triggers on queries about DAX calculations, table relationships, dimension/fact table design, naming conventions, model documentation, cardinality, cross-filter direction, calculation groups, and data model best practices. Always connects to the active model first using power-bi-modeling MCP tools to understand the data structure before providing guidance.''
---

# Power BI Semantic Modeling

Guide users in building optimized, well-documented Power BI semantic models following Microsoft best practices.

## When to Use This Skill

Use this skill when users ask about:
- Creating or optimizing Power BI semantic models
- Designing star schemas (dimension/fact tables)
- Writing DAX measures or calculated columns
- Configuring table relationships (cardinality, cross-filter)
- Implementing row-level security (RLS)
- Naming conventions for tables, columns, measures
- Adding descriptions and documentation to models
- Performance tuning and optimization
- Calculation groups and field parameters
- Model validation and best practice checks

**Trigger phrases:** "create a measure", "add relationship", "star schema", "optimize model", "DAX formula", "RLS", "naming convention", "model documentation", "cardinality", "cross-filter"

## Prerequisites

### Required Tools
- **Power BI Modeling MCP Server**: Required for connecting to and modifying semantic models
  - Enables: connection_operations, table_operations, measure_operations, relationship_operations, etc.
  - Must be configured and running to interact with models

### Optional Dependencies
- **Microsoft Learn MCP Server**: Recommended for researching latest best practices
  - Enables: microsoft_docs_search, microsoft_docs_fetch
  - Use for complex scenarios, new features, and official documentation

## Workflow

### 1. Connect and Analyze First

Before providing any modeling guidance, always examine the current model state:

```
1. List connections: connection_operations(operation: "ListConnections")
2. If no connection, check for local instances: connection_operations(operation: "ListLocalInstances")
3. Connect to the model (Desktop or Fabric)
4. Get model overview: model_operations(operation: "Get")
5. List tables: table_operations(operation: "List")
6. List relationships: relationship_operations(operation: "List")
7. List measures: measure_operations(operation: "List")
```

### 2. Evaluate Model Health

After connecting, assess the model against best practices:

- **Star Schema**: Are tables properly classified as dimension or fact?
- **Relationships**: Correct cardinality? Minimal bidirectional filters?
- **Naming**: Human-readable, consistent naming conventions?
- **Documentation**: Do tables, columns, measures have descriptions?
- **Measures**: Explicit measures for key calculations?
- **Hidden Fields**: Are technical columns hidden from report view?

### 3. Provide Targeted Guidance

Based on analysis, guide improvements using references:
- Star schema design: See [STAR-SCHEMA.md](references/STAR-SCHEMA.md)
- Relationship configuration: See [RELATIONSHIPS.md](references/RELATIONSHIPS.md)
- DAX measures and naming: See [MEASURES-DAX.md](references/MEASURES-DAX.md)
- Performance optimization: See [PERFORMANCE.md](references/PERFORMANCE.md)
- Row-level security: See [RLS.md](references/RLS.md)

## Quick Reference: Model Quality Checklist

| Area | Best Practice |
|------|--------------|
| Tables | Clear dimension vs fact classification |
| Naming | Human-readable: `Customer Name` not `CUST_NM` |
| Descriptions | All tables, columns, measures documented |
| Measures | Explicit DAX measures for business metrics |
| Relationships | One-to-many from dimension to fact |
| Cross-filter | Single direction unless specifically needed |
| Hidden fields | Hide technical keys, IDs from report view |
| Date table | Dedicated marked date table |

## MCP Tools Reference

Use these Power BI Modeling MCP operations:

| Operation Category | Key Operations |
|-------------------|----------------|
| `connection_operations` | Connect, ListConnections, ListLocalInstances, ConnectFabric |
| `model_operations` | Get, GetStats, ExportTMDL |
| `table_operations` | List, Get, Create, Update, GetSchema |
| `column_operations` | List, Get, Create, Update (descriptions, hidden, format) |
| `measure_operations` | List, Get, Create, Update, Move |
| `relationship_operations` | List, Get, Create, Update, Activate, Deactivate |
| `dax_query_operations` | Execute, Validate |
| `calculation_group_operations` | List, Create, Update |
| `security_role_operations` | List, Create, Update, GetEffectivePermissions |

## Common Tasks

### Add Measure with Description
```
measure_operations(
  operation: "Create",
  definitions: [{
    name: "Total Sales",
    tableName: "Sales",
    expression: "SUM(Sales[Amount])",
    formatString: "$#,##0",
    description: "Sum of all sales amounts"
  }]
)
```

### Update Column Description
```
column_operations(
  operation: "Update",
  definitions: [{
    tableName: "Customer",
    name: "CustomerKey",
    description: "Unique identifier for customer dimension",
    isHidden: true
  }]
)
```

### Create Relationship
```
relationship_operations(
  operation: "Create",
  definitions: [{
    fromTable: "Sales",
    fromColumn: "CustomerKey",
    toTable: "Customer",
    toColumn: "CustomerKey",
    crossFilteringBehavior: "OneDirection"
  }]
)
```

## When to Use Microsoft Learn MCP

Research current best practices using `microsoft_docs_search` for:
- Latest DAX function documentation
- New Power BI features and capabilities
- Complex modeling scenarios (SCD Type 2, many-to-many)
- Performance optimization techniques
- Security implementation patterns
' WHERE slug = 'github-powerbi-modeling';
UPDATE skills SET content = '---
name: webapp-testing
description: Toolkit for interacting with and testing local web applications using Playwright. Supports verifying frontend functionality, debugging UI behavior, capturing browser screenshots, and viewing browser logs.
---

# Web Application Testing

This skill enables comprehensive testing and debugging of local web applications using Playwright automation.

## When to Use This Skill

Use this skill when you need to:
- Test frontend functionality in a real browser
- Verify UI behavior and interactions
- Debug web application issues
- Capture screenshots for documentation or debugging
- Inspect browser console logs
- Validate form submissions and user flows
- Check responsive design across viewports

## Prerequisites

- Node.js installed on the system
- A locally running web application (or accessible URL)
- Playwright will be installed automatically if not present

## Core Capabilities

### 1. Browser Automation
- Navigate to URLs
- Click buttons and links
- Fill form fields
- Select dropdowns
- Handle dialogs and alerts

### 2. Verification
- Assert element presence
- Verify text content
- Check element visibility
- Validate URLs
- Test responsive behavior

### 3. Debugging
- Capture screenshots
- View console logs
- Inspect network requests
- Debug failed tests

## Usage Examples

### Example 1: Basic Navigation Test
```javascript
// Navigate to a page and verify title
await page.goto(''http://localhost:3000'');
const title = await page.title();
console.log(''Page title:'', title);
```

### Example 2: Form Interaction
```javascript
// Fill out and submit a form
await page.fill(''#username'', ''testuser'');
await page.fill(''#password'', ''password123'');
await page.click(''button[type="submit"]'');
await page.waitForURL(''**/dashboard'');
```

### Example 3: Screenshot Capture
```javascript
// Capture a screenshot for debugging
await page.screenshot({ path: ''debug.png'', fullPage: true });
```

## Guidelines

1. **Always verify the app is running** - Check that the local server is accessible before running tests
2. **Use explicit waits** - Wait for elements or navigation to complete before interacting
3. **Capture screenshots on failure** - Take screenshots to help debug issues
4. **Clean up resources** - Always close the browser when done
5. **Handle timeouts gracefully** - Set reasonable timeouts for slow operations
6. **Test incrementally** - Start with simple interactions before complex flows
7. **Use selectors wisely** - Prefer data-testid or role-based selectors over CSS classes

## Common Patterns

### Pattern: Wait for Element
```javascript
await page.waitForSelector(''#element-id'', { state: ''visible'' });
```

### Pattern: Check if Element Exists
```javascript
const exists = await page.locator(''#element-id'').count() > 0;
```

### Pattern: Get Console Logs
```javascript
page.on(''console'', msg => console.log(''Browser log:'', msg.text()));
```

### Pattern: Handle Errors
```javascript
try {
  await page.click(''#button'');
} catch (error) {
  await page.screenshot({ path: ''error.png'' });
  throw error;
}
```

## Limitations

- Requires Node.js environment
- Cannot test native mobile apps (use React Native Testing Library instead)
- May have issues with complex authentication flows
- Some modern frameworks may require specific configuration
' WHERE slug = 'github-webapp-testing';
UPDATE skills SET content = '---
name: nano-banana-pro-openrouter
description: ''Generate or edit images via OpenRouter with the Gemini 3 Pro Image model. Use for prompt-only image generation, image edits, and multi-image compositing; supports 1K/2K/4K output.''
metadata:
  emoji: 🍌
  requires:
    bins:
      - uv
    env:
      - OPENROUTER_API_KEY
  primaryEnv: OPENROUTER_API_KEY
---


# Nano Banana Pro OpenRouter

## Overview

Generate or edit images with OpenRouter using the `google/gemini-3-pro-image-preview` model. Support prompt-only generation, single-image edits, and multi-image composition.

### Prompt-only generation

```
uv run {baseDir}/scripts/generate_image.py \
  --prompt "A cinematic sunset over snow-capped mountains" \
  --filename sunset.png
```

### Edit a single image

```
uv run {baseDir}/scripts/generate_image.py \
  --prompt "Replace the sky with a dramatic aurora" \
  --input-image input.jpg \
  --filename aurora.png
```

### Compose multiple images

```
uv run {baseDir}/scripts/generate_image.py \
  --prompt "Combine the subjects into a single studio portrait" \
  --input-image face1.jpg \
  --input-image face2.jpg \
  --filename composite.png
```

## Resolution

- Use `--resolution` with `1K`, `2K`, or `4K`.
- Default is `1K` if not specified.

## System prompt customization

The skill reads an optional system prompt from `assets/SYSTEM_TEMPLATE`. This allows you to customize the image generation behavior without modifying code.

## Behavior and constraints

- Accept up to 3 input images via repeated `--input-image`.
- `--filename` accepts relative paths (saves to current directory) or absolute paths.
- If multiple images are returned, append `-1`, `-2`, etc. to the filename.
- Print `MEDIA: <path>` for each saved image. Do not read images back into the response.

## Troubleshooting

If the script exits non-zero, check stderr against these common blockers:

| Symptom | Resolution |
|---------|------------|
| `OPENROUTER_API_KEY is not set` | Ask the user to set it. PowerShell: `$env:OPENROUTER_API_KEY = "sk-or-..."` / bash: `export OPENROUTER_API_KEY="sk-or-..."` |
| `uv: command not found` or not recognized | macOS/Linux: <code>curl -LsSf https://astral.sh/uv/install.sh &#124; sh</code>. Windows: <code>powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 &#124; iex"</code>. Then restart the terminal. |
| `AuthenticationError` / HTTP 401 | Key is invalid or has no credits. Verify at <https://openrouter.ai/settings/keys>. |

For transient errors (HTTP 429, network timeouts), retry once after 30 seconds. Do not retry the same error more than twice — surface the issue to the user instead.
' WHERE slug = 'github-nano-banana-pro-openrouter';