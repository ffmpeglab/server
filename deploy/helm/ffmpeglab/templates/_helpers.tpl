{{/* Chart name, overridable. */}}
{{- define "ffmpeglab.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Fully qualified release name. */}}
{{- define "ffmpeglab.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/* Tenant identifier; falls back to the release name. */}}
{{- define "ffmpeglab.tenant" -}}
{{- default .Release.Name .Values.tenant.name -}}
{{- end -}}

{{- define "ffmpeglab.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{ include "ffmpeglab.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: ffmpeglab
ffmpeglab.com/tenant: {{ include "ffmpeglab.tenant" . | quote }}
{{- end -}}

{{- define "ffmpeglab.selectorLabels" -}}
app.kubernetes.io/name: {{ include "ffmpeglab.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/* Image reference; a digest wins over a tag. */}}
{{- define "ffmpeglab.image" -}}
{{- if .Values.image.digest -}}
{{- printf "%s@%s" .Values.image.repository .Values.image.digest -}}
{{- else -}}
{{- printf "%s:%s" .Values.image.repository (.Values.image.tag | default .Chart.AppVersion) -}}
{{- end -}}
{{- end -}}

{{/* Name of the Secret carrying tenant credentials, if any. */}}
{{- define "ffmpeglab.secretName" -}}
{{- if .Values.existingSecret -}}
{{- .Values.existingSecret -}}
{{- else if .Values.secret.create -}}
{{- printf "%s-credentials" (include "ffmpeglab.fullname" .) -}}
{{- end -}}
{{- end -}}

{{- define "ffmpeglab.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "ffmpeglab.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/*
Shared Deployment body.
Call with: (dict "ctx" $ "component" "<name>" "cfg" .Values.<name>)
No environment variable name appears here — everything comes from values.
*/}}
{{- define "ffmpeglab.deployment" -}}
{{- $ctx := .ctx -}}
{{- $component := .component -}}
{{- $cfg := .cfg -}}
{{- $secretName := include "ffmpeglab.secretName" $ctx -}}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "ffmpeglab.fullname" $ctx }}-{{ $component }}
  labels:
    {{- include "ffmpeglab.labels" $ctx | nindent 4 }}
    app.kubernetes.io/component: {{ $component }}
spec:
  replicas: {{ $cfg.replicaCount | default 1 }}
  {{- with $ctx.Values.updateStrategy }}
  strategy:
    {{- toYaml . | nindent 4 }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "ffmpeglab.selectorLabels" $ctx | nindent 6 }}
      app.kubernetes.io/component: {{ $component }}
  template:
    metadata:
      labels:
        {{- include "ffmpeglab.selectorLabels" $ctx | nindent 8 }}
        app.kubernetes.io/component: {{ $component }}
      {{- if or $cfg.podAnnotations $ctx.Values.secretChecksum }}
      annotations:
        {{- with $cfg.podAnnotations }}
        {{- toYaml . | nindent 8 }}
        {{- end }}
        {{- with $ctx.Values.secretChecksum }}
        # Credentials arrive through envFrom, which Kubernetes reads once at
        # start, so a rotated password reaches nothing until the pod restarts.
        # Carrying the checksum here changes the pod spec when the Secret
        # changes, and the rollout follows on its own.
        ffmpeglab.com/secret-checksum: {{ . | quote }}
        {{- end }}
      {{- end }}
    spec:
      {{- with $ctx.Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with include "ffmpeglab.serviceAccountName" $ctx }}
      serviceAccountName: {{ . }}
      {{- end }}
      {{- with $ctx.Values.podSecurityContext }}
      securityContext:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- if or $ctx.Values.dnsWait.enabled $ctx.Values.statusGate.enabled }}
      initContainers:
        {{- if $ctx.Values.statusGate.enabled }}
        # A tenant switched off in the registry should stop working without
        # waiting for a pipeline run. The flag travels with the credentials, so
        # the pod can read it: while it is not on, this container waits and the
        # application never starts. Turning the tenant back on rewrites the
        # Secret, the operator restarts the deployment, and this check passes.
        - name: wait-for-status
          image: {{ $ctx.Values.dnsWait.image }}
          command:
            - sh
            - -c
            - |
              while :; do
                status=$(printenv {{ $ctx.Values.statusGate.key }} || true)
                if [ "$status" = "{{ $ctx.Values.statusGate.expected }}" ]; then
                  echo "tenant is {{ $ctx.Values.statusGate.expected }}"
                  exit 0
                fi
                echo "tenant is ${status:-unset}, holding"
                sleep {{ $ctx.Values.statusGate.intervalSeconds }}
              done
          {{- if $secretName }}
          envFrom:
            - secretRef:
                name: {{ $secretName }}
          {{- end }}
          resources:
            requests:
              cpu: 10m
              memory: 16Mi
        {{- end }}
        {{- if $ctx.Values.dnsWait.enabled }}
        # Cluster DNS is not always answering for external names by the time pods
        # start, and the application exits instead of retrying — which turns every
        # cluster restart into a crash-loop backoff.
        - name: wait-for-dns
          image: {{ $ctx.Values.dnsWait.image }}
          command:
            - sh
            - -c
            - |
              host=$(printenv {{ $ctx.Values.dnsWait.hostFrom }} || true)
              if [ -z "$host" ]; then
                echo "{{ $ctx.Values.dnsWait.hostFrom }} is empty, nothing to wait for"
                exit 0
              fi
              i=0
              until nslookup "$host" >/dev/null 2>&1; do
                i=$((i+1))
                if [ "$i" -ge {{ $ctx.Values.dnsWait.attempts }} ]; then
                  echo "cannot resolve $host after $i attempts"
                  exit 1
                fi
                sleep {{ $ctx.Values.dnsWait.intervalSeconds }}
              done
              echo "$host resolved"
          {{- if $secretName }}
          envFrom:
            - secretRef:
                name: {{ $secretName }}
          {{- end }}
          {{- if or $ctx.Values.env $cfg.env }}
          env:
            {{- range $key, $value := $ctx.Values.env }}
            - name: {{ $key }}
              value: {{ $value | quote }}
            {{- end }}
          {{- end }}
          resources:
            requests:
              cpu: 10m
              memory: 16Mi
        {{- end }}
      {{- end }}
      containers:
        - name: {{ $component }}
          image: {{ include "ffmpeglab.image" $ctx }}
          imagePullPolicy: {{ $ctx.Values.image.pullPolicy }}
          {{- with $ctx.Values.securityContext }}
          securityContext:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- if or $ctx.Values.env $cfg.env }}
          env:
            {{- range $key, $value := $ctx.Values.env }}
            - name: {{ $key }}
              value: {{ $value | quote }}
            {{- end }}
            {{- range $key, $value := $cfg.env }}
            - name: {{ $key }}
              value: {{ $value | quote }}
            {{- end }}
          {{- end }}
          {{- if $secretName }}
          envFrom:
            - secretRef:
                name: {{ $secretName }}
          {{- end }}
          {{- if $cfg.containerPort }}
          ports:
            - name: http
              containerPort: {{ $cfg.containerPort }}
              protocol: TCP
          {{- end }}
          {{- if and $cfg.probes $cfg.probes.enabled $cfg.containerPort }}
          readinessProbe:
            httpGet:
              path: {{ $cfg.probes.path }}
              port: http
            initialDelaySeconds: {{ $cfg.probes.initialDelaySeconds }}
            periodSeconds: {{ $cfg.probes.periodSeconds }}
            timeoutSeconds: {{ $cfg.probes.timeoutSeconds }}
            failureThreshold: {{ $cfg.probes.failureThreshold }}
          livenessProbe:
            httpGet:
              path: {{ $cfg.probes.path }}
              port: http
            initialDelaySeconds: {{ $cfg.probes.initialDelaySeconds }}
            periodSeconds: {{ $cfg.probes.periodSeconds }}
            timeoutSeconds: {{ $cfg.probes.timeoutSeconds }}
            failureThreshold: {{ $cfg.probes.failureThreshold }}
          {{- end }}
          {{- with $cfg.resources }}
          resources:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- if $cfg.mountDocumentDir }}
          volumeMounts:
            - name: document-dir
              mountPath: {{ $ctx.Values.documentDir.mountPath }}
          {{- end }}
      {{- if $cfg.mountDocumentDir }}
      volumes:
        - name: document-dir
          {{- if $ctx.Values.documentDir.persistence.enabled }}
          persistentVolumeClaim:
            claimName: {{ $ctx.Values.documentDir.persistence.existingClaim | default (printf "%s-documents" (include "ffmpeglab.fullname" $ctx)) }}
          {{- else }}
          emptyDir:
            {{- with $ctx.Values.documentDir.medium }}
            medium: {{ . }}
            {{- end }}
            {{- with $ctx.Values.documentDir.sizeLimit }}
            sizeLimit: {{ . }}
            {{- end }}
          {{- end }}
      {{- end }}
      {{- with $cfg.nodeSelector }}
      nodeSelector:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with $cfg.affinity }}
      affinity:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with $cfg.tolerations }}
      tolerations:
        {{- toYaml . | nindent 8 }}
      {{- end }}
{{- end -}}
