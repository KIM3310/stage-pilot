# StagePilot Terraform

Minimal Cloud Run deployment skeleton for the `stage-pilot` operator API.

## Apply

```bash
terraform init
terraform apply \
  -var="project_id=your-project" \
  -var="image=asia-northeast3-docker.pkg.dev/your-project/apps/stagepilot:latest"
```

Use `env` to inject `STAGEPILOT_OPERATOR_TOKEN`, Gemini settings, and OpenClaw runtime configuration.
