# Troubleshooting

## Where to look first

```bash
kubectl get pods -n ffmpeglab
kubectl describe pod -n ffmpeglab <pod>
kubectl logs -n ffmpeglab <pod> --tail=50
kubectl get events -n ffmpeglab --sort-by=.lastTimestamp | tail -20
```

## Pods stay in Init

The init container waits for `DB_HOST` to resolve. Either the name is wrong or
cluster DNS cannot answer for it:

```bash
kubectl logs -n ffmpeglab <pod> -c wait-for-dns
```

A Supabase project resolves only through its pooler host; `db.<ref>.supabase.co`
has an IPv6 address and no A record, so nothing in a cluster can reach it.

## CrashLoopBackOff on a database that has been used before

```
sequence pgmq.q_render_msg_id_seq is already a member of extension "pgmq"
```

`nestjs-pgmq` calls `pgmq.create` on every boot. Drop the queues first:

```sql
select pgmq.drop_queue('render'), pgmq.drop_queue('logs'), pgmq.drop_queue('file');
```

## The file runner exits immediately

```
TypeError: Cannot read properties of undefined (reading 'search')
    at new ResultProcessor
```

`S3_ENDPOINT` is unset. The processor calls `.search()` on it in its
constructor, so the process dies before Nest finishes starting. Set the `S3_*`
variables or run with `--set file.enabled=false`.

## A render stays in `created`

```
ERROR [ExceptionsHandler] error: new row violates row-level security policy
  for table "q_render"
```

The API accepted the render but could not enqueue it. Checked against the
database:

```sql
select current_user,
       has_table_privilege('pgmq.q_render','INSERT') as can_insert,
       (select relrowsecurity from pg_class where relname='q_render') as rls,
       (select count(*) from pg_policies where tablename='q_render') as policies;
```

```
user_ffmpeglab_… | t | t | 0
```

The grant is there. Row-level security is enabled on the queue table and no
policy exists, and Postgres denies every row to a non-owner in that situation —
a grant does not override it. The table is owned by `postgres`, which bypasses
RLS, so the same application works when it connects as the owner.

This comes from the database, not from the deployment. Nothing in this
repository or in the platform that provisions tenants enables row-level
security — exposing a schema through the Supabase API does, and it applies to
the tables in it. Add a policy for the role, or turn the flag off on that table.

Reproduce it directly:

```bash
curl -s -X PUT http://localhost:3000/renders/run \
  -H "Authorization: Bearer <key>" -H "Content-Type: application/json" \
  -d '{"renderId":"<id>"}'
```

A 500 with that message in the API log is this, and no amount of redeploying
changes it.

## Pending pods

```bash
kubectl describe pod -n ffmpeglab <pod> | sed -n '/Events:/,$p'
kubectl describe node | grep -A5 "Allocated resources"
```

`Insufficient cpu` means the node is full. Three instances of four components fit
on a two vCPU node with about 500m to spare; a fourth does not.

`ReadWriteMany` on a cluster with no such class leaves the claim `Pending`
forever. Point `DOCUMENT_STORAGE_CLASS` at a class that provides it, or use
`DOCUMENT_EXISTING_CLAIM`.

## Helm says the rollout succeeded but nothing works

A Deployment with one replica and `maxUnavailable: 1` never breaches its
availability budget, so `--wait` returns immediately even with zero ready pods.
Check the Deployments directly:

```bash
kubectl rollout status -n ffmpeglab deployment --timeout=5m
```

## An edit to the chart changes nothing

`helm_release` compares chart versions. Bump `version` in `Chart.yaml`.

## minikube shows an empty cluster in a GUI client

`minikube stop` hands out a new API server port on the next start. `kubectl`
follows; Lens and similar keep the old connection until reconnected.
