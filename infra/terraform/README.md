# StagePilot Terraform

Cloud Run deployment scaffold for `stage-pilot` with:
- required Google API enablement
- dedicated runtime service account
- Secret Manager env injection
- configurable public/private invoker IAM
- health and startup probes

## Apply

```bash
terraform init
terraform apply \
  -var="project_id=your-project" \
  -var="image=asia-northeast3-docker.pkg.dev/your-project/apps/stagepilot:latest" \
  -var='env={
    STAGEPILOT_RUNTIME_STORE_PATH="/app/.runtime/stagepilot-runtime-events.db"
    STAGEPILOT_OPERATOR_ALLOWED_ROLES="case_manager,operator"
  }' \
  -var='secret_env={
    STAGEPILOT_OPERATOR_TOKEN={secret="stagepilot-operator-token",version="latest"}
    GEMINI_API_KEY={secret="gemini-api-key",version="latest"}
  }'
```

## Common toggles

```bash
-var="allow_unauthenticated=false"
-var='invoker_members=["group:platform-admins@example.com"]'
-var="create_service_account=false"
-var="service_account_email=stagepilot-runtime@your-project.iam.gserviceaccount.com"
```

## Notes

- Use `env` for non-secret config and `secret_env` for Secret Manager-backed values.
- When `allow_unauthenticated=false`, add explicit `invoker_members` for operators or platform groups.
- The runtime identity gets `roles/secretmanager.secretAccessor` on referenced secrets automatically.
- Container probes default to `/health`.
