# The reconciler as a container, so a cluster can keep itself in step with the
# registry without anything outside it running.

FROM hashicorp/terraform:1.5.7

RUN apk add --no-cache curl

WORKDIR /work
COPY terraform/ /work/terraform/
COPY helm/ /work/helm/

# Anything the build context happened to carry from a developer's machine —
# a local state file, a provider cache, the bucket backend — would either be
# migrated into the cluster or fight with it.
RUN rm -rf /work/terraform/.terraform \
           /work/terraform/terraform.tfstate* \
           /work/terraform/backend.tf

# State goes into a Secret in the cluster rather than a bucket: the point of
# running here is not to depend on anything outside.
RUN printf 'terraform {\n  backend "kubernetes" {\n    secret_suffix = "tenants"\n    in_cluster_config = true\n  }\n}\n' \
      > /work/terraform/backend.tf

COPY reconciler/run.sh /work/run.sh

ENTRYPOINT ["/work/run.sh"]
