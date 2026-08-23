# Development

## Working on the chart

```bash
helm lint deploy/helm/ffmpeglab
helm template test deploy/helm/ffmpeglab
```

Rendering with the values a real install uses:

```bash
helm template test deploy/helm/ffmpeglab \
  --set secret.create=true \
  --set 'documentDir.persistence.accessModes[0]=ReadWriteOnce'
```

Applying a change to a running cluster:

```bash
./deploy/deploy.sh local
```

**Bump `version` in `Chart.yaml` when you edit the chart.** Terraform's
`helm_release` compares chart versions, so without a bump it reports no changes
and the edit never reaches the cluster. Helm on its own does not care.

## Running a real render

A Running pod proves the process started, not that ffmpeg works. `example.sh` in
the repository root submits a render, polls it, and prints the result.

It needs an API key. There is no signup endpoint, so insert one into the tenant's
database:

`date` is NOT NULL and has no default:

```sql
insert into api_key (title, apikey, user_id, data, date)
values ('local', 'ffmpeglab_sk_local', gen_random_uuid(), '{}', now());
```

Both variables come from the environment:

```bash
kubectl port-forward -n ffmpeglab svc/ffmpeglab-api 3000:3000 &

API_HOST=http://localhost:3000 API_KEY=ffmpeglab_sk_local bash example.sh
```

It downloads a sample video, runs ffmpeg over it in the render runner, and polls
until the render reports finished. Watch the work happen:

```bash
kubectl logs -n ffmpeglab -l app.kubernetes.io/component=render -f
```

The file runner uploads the result to object storage. It is the last step of the
render, so a render that finishes without an upload means that component is not
running or has no storage configured.
