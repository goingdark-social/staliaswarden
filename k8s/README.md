# Kubernetes Deployment

This directory contains Kubernetes manifests for deploying staliaswarden.

## Prerequisites

1. A Kubernetes cluster
2. `kubectl` configured to access your cluster
3. Access to GitHub Container Registry (GHCR) to pull the image
4. External Secrets Operator installed in your cluster
5. A ClusterSecretStore configured (e.g., `bitwarden-backend`)

## Setup

### 1. Create Namespace

First, create the namespace:

```bash
kubectl apply -f namespace.yaml
```

Or manually:

```bash
kubectl create namespace staliaswarden
```

### 2. Create the Secret using External Secrets

The application uses External Secrets Operator to fetch secrets from your secret store.

**Option A: Using External Secrets (Recommended)**

Update `external-secret.yaml` with the correct remote key references for your secret store, then apply:

```bash
kubectl apply -f external-secret.yaml
```

The ExternalSecret will automatically create the `staliaswarden-secrets` Kubernetes secret. Verify it was created:

```bash
kubectl get externalsecret -n staliaswarden
kubectl get secret staliaswarden-secrets -n staliaswarden
```

**Option B: Manual Secret Creation (Alternative)**

If you're not using External Secrets Operator, you can create the secret manually:

```bash
kubectl create secret generic staliaswarden-secrets \
  --namespace=staliaswarden \
  --from-literal=api_token='your-api-token' \
  --from-literal=alias_domain='yourdomain.com' \
  --from-literal=forward_to='your-main-email@example.com' \
  --from-literal=stalwart_username='your-stalwart-username' \
  --from-literal=stalwart_password='your-stalwart-password'
```

Or use the example file as a template:

```bash
# Edit secret.yaml.example with your values, then:
kubectl apply -f secret.yaml -n staliaswarden
```

### 3. Create GHCR Image Pull Secret

To pull images from GitHub Container Registry, create a secret with your GitHub token:

```bash
kubectl create secret docker-registry ghcr-secret \
  --namespace=staliaswarden \
  --docker-server=ghcr.io \
  --docker-username=YOUR_GITHUB_USERNAME \
  --docker-password=YOUR_GITHUB_TOKEN
```

Replace:
- `YOUR_GITHUB_USERNAME` with your GitHub username
- `YOUR_GITHUB_TOKEN` with a Personal Access Token that has `read:packages` permission

### 3. Update External Secret (if using External Secrets)

If using External Secrets, edit `external-secret.yaml` and update the `remoteRef.key` values to match your secret store keys:

- `app-staliaswarden-api-token` - API token for Bitwarden extension
- `app-staliaswarden-alias-domain` - Email domain for aliases
- `app-staliaswarden-forward-to` - Main email address
- `app-stalwart-username` - Stalwart admin username
- `app-stalwart-admin-password` - Stalwart admin password

Also ensure the `secretStoreRef.name` matches your ClusterSecretStore name (default: `bitwarden-backend`).

### 4. Update Deployment

Edit `deployment.yaml` and update the `STALWART_URL` if needed (currently set to `https://mailadmin.peekoff.com`).

Also update the image reference if you're using a specific tag instead of `latest`:

```yaml
image: ghcr.io/goingdark-social/staliaswarden:latest
```

### 5. Deploy

Apply the manifests:

```bash
# If using External Secrets:
kubectl apply -f namespace.yaml
kubectl apply -f external-secret.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
```

Or apply all at once:

```bash
kubectl apply -f .
```

**Note:** If using External Secrets, wait for the ExternalSecret to sync and create the Kubernetes secret before deploying the application:

```bash
kubectl wait --for=condition=Ready externalsecret/staliaswarden-secrets -n staliaswarden --timeout=60s
```

### 6. Verify

Check the deployment status:

```bash
kubectl get pods -n staliaswarden -l app=staliaswarden
kubectl get svc -n staliaswarden staliaswarden
```

View logs:

```bash
kubectl logs -n staliaswarden -l app=staliaswarden
```

## Security

The deployment is configured with security best practices:

- **Non-root execution**: Container runs as user 1001 (nodejs user)
- **Security contexts**: Pod and container security contexts enforce non-root, no privilege escalation
- **Capabilities**: All Linux capabilities are dropped
- **Seccomp**: Runtime default seccomp profile is enforced
- **Read-only secrets**: Secrets are mounted as read-only volumes

## Configuration

The application reads configuration from:
1. Kubernetes secrets mounted at `/etc/secrets/` (primary method)
2. Environment variables (fallback)

The following secrets are expected in the `staliaswarden-secrets` Kubernetes secret:
- `api_token` - API token for Bitwarden authentication
- `alias_domain` - Default domain for email aliases (optional)
- `forward_to` - Main email address where aliases forward
- `stalwart_username` - Stalwart admin username
- `stalwart_password` - Stalwart admin password

These secrets are typically managed via External Secrets Operator. See `external-secret.yaml` for the configuration.

## Ingress (Optional)

If you want to expose the service externally, create an Ingress resource:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: staliaswarden-ingress
  namespace: staliaswarden
spec:
  rules:
  - host: staliaswarden.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: staliaswarden
            port:
              number: 80
```

