import { useRef, useState, type ChangeEvent, type JSX } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import {
  Bell,
  Braces,
  CheckCircle2,
  Database,
  FileCode2,
  FileText,
  Mail,
  Network,
  Send,
  Ticket,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '../components/ui/button.js';
import {
  KNOWLEDGE_GRAPH_DESTINATIONS,
  saveModuleKnowledgeGraphUpdate,
} from '../lib/module-knowledge-graph.js';

type ArtifactKind = {
  id: string;
  label: string;
  description: string;
  icon: typeof FileText;
  accent: string;
  iconColour: string;
  allowedExtensions: string[];
};

const ARTIFACTS: ArtifactKind[] = [
  {
    id: 'brd',
    label: 'BRD',
    description: 'Business requirements',
    icon: FileText,
    accent: 'border-l-blue-500',
    iconColour: 'text-blue-600 bg-blue-50',
    allowedExtensions: ['.pdf', '.doc', '.docx', '.md'],
  },
  {
    id: 'code',
    label: 'Code',
    description: 'Source code and repositories',
    icon: Braces,
    accent: 'border-l-violet-500',
    iconColour: 'text-violet-600 bg-violet-50',
    allowedExtensions: ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cs', '.go', '.zip'],
  },
  {
    id: 'screenshots',
    label: 'SS',
    description: 'Screenshots and UI captures',
    icon: FileCode2,
    accent: 'border-l-amber-500',
    iconColour: 'text-amber-600 bg-amber-50',
    allowedExtensions: ['.png', '.jpg', '.jpeg'],
  },
  {
    id: 'logs',
    label: 'Logs',
    description: 'Application and system logs',
    icon: FileText,
    accent: 'border-l-slate-500',
    iconColour: 'text-slate-600 bg-slate-100',
    allowedExtensions: ['.log', '.txt', '.json', '.csv'],
  },
  {
    id: 'technical-documents',
    label: 'Tech Document',
    description: 'Architecture and technical specs',
    icon: FileText,
    accent: 'border-l-cyan-500',
    iconColour: 'text-cyan-600 bg-cyan-50',
    allowedExtensions: ['.pdf', '.doc', '.docx', '.md'],
  },
  {
    id: 'tickets',
    label: 'Ticket',
    description: 'Work items and issue history',
    icon: Ticket,
    accent: 'border-l-rose-500',
    iconColour: 'text-rose-600 bg-rose-50',
    allowedExtensions: ['.pdf', '.csv', '.json', '.xlsx'],
  },
  {
    id: 'data-models',
    label: 'Data Models',
    description: 'Schemas and entity definitions',
    icon: Network,
    accent: 'border-l-indigo-500',
    iconColour: 'text-indigo-600 bg-indigo-50',
    allowedExtensions: ['.json', '.xml', '.yaml', '.yml', '.sql'],
  },
  {
    id: 'database',
    label: 'Database',
    description: 'Database exports and queries',
    icon: Database,
    accent: 'border-l-emerald-500',
    iconColour: 'text-emerald-600 bg-emerald-50',
    allowedExtensions: ['.sql', '.csv', '.json', '.dump', '.bak'],
  },
  {
    id: 'email',
    label: 'Email Notifications',
    description: 'Notifications and message templates',
    icon: Mail,
    accent: 'border-l-orange-500',
    iconColour: 'text-orange-600 bg-orange-50',
    allowedExtensions: ['.eml', '.msg', '.pdf', '.html', '.txt'],
  },
  {
    id: 'telemetrics',
    label: 'Telemetrics',
    description: 'Metrics, traces and telemetry',
    icon: Bell,
    accent: 'border-l-fuchsia-500',
    iconColour: 'text-fuchsia-600 bg-fuchsia-50',
    allowedExtensions: ['.json', '.csv', '.log', '.txt'],
  },
];

const MODULES = ['module-1', 'module-2', 'module-3', 'module-4', 'module-5', 'module-6'];
export function ModuleWorkspacePage(): JSX.Element {
  const { moduleId = 'module-1' } = useParams();
  const [uploads, setUploads] = useState<Record<string, string[]>>({});
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const moduleName = moduleId.replace('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  const uploadCount = Object.values(uploads).flat().length;

  function addFiles(artifact: ArtifactKind, event: ChangeEvent<HTMLInputElement>): void {
    const selectedFiles = Array.from(event.target.files ?? []);
    const validFiles = selectedFiles.filter((file) =>
      artifact.allowedExtensions.some((extension) => file.name.toLowerCase().endsWith(extension)),
    );
    const rejectedFiles = selectedFiles.filter((file) => !validFiles.includes(file));

    if (validFiles.length) {
      setUploads((previous) => ({
        ...previous,
        [artifact.id]: [...(previous[artifact.id] ?? []), ...validFiles.map((file) => file.name)],
      }));
    }
    setUploadErrors((previous) => ({
      ...previous,
      [artifact.id]: rejectedFiles.length
        ? `${rejectedFiles.map((file) => file.name).join(', ')} rejected. Allowed: ${artifact.allowedExtensions.join(', ')}.`
        : '',
    }));
    event.target.value = '';
  }

  function removeFile(kind: string, fileName: string): void {
    setUploads((previous) => ({
      ...previous,
      [kind]: previous[kind]?.filter((name) => name !== fileName) ?? [],
    }));
  }

  function generateOutput(artifact: ArtifactKind): void {
    const files = uploads[artifact.id] ?? [];
    const artifactLabels = [...new Set([...Object.keys(outputs), artifact.id])]
      .map((id) => ARTIFACTS.find((item) => item.id === id)?.label)
      .filter((label): label is string => Boolean(label));
    setOutputs((previous) => ({
      ...previous,
      [artifact.id]: files.length
        ? `Ready for LLM integration. ${files.length} ${artifact.label} file${files.length === 1 ? '' : 's'} and this card's prompt will be sent to your future model integration. The response is staged for the combined Knowledge Graph update.`
        : `Upload ${artifact.label} evidence first. This card's generated response will be included in the combined Knowledge Graph update.`,
    }));
    saveModuleKnowledgeGraphUpdate(moduleId, artifactLabels);
  }

  return (
    <div className="-mb-4 flex flex-col">
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#00338D]">
            Reverse engineering workspace
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{moduleName}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Upload project evidence, then use an LLM prompt to generate implementation-ready
            understanding of this module.
          </p>
        </div>
        <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          <span className="font-semibold">{uploadCount}</span> file{uploadCount === 1 ? '' : 's'}{' '}
          staged for analysis
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 border-b border-border pb-4">
        {MODULES.map((module) => (
          <NavLink
            key={module}
            to={`/modules/${module}`}
            className={({ isActive }) =>
              `rounded-md px-4 py-2 text-sm font-medium transition-colors ${isActive ? 'bg-[#00338D] text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-[#00338D]'}`
            }
          >
            {module.replace('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())}
          </NavLink>
        ))}
      </div>

      <section aria-labelledby="evidence-heading">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 id="evidence-heading" className="text-base font-semibold">
              Evidence intake
            </h2>
            <p className="text-xs text-muted-foreground">
              Each artifact has its own upload, LLM prompt, and generated response. Results are
              combined locally for the Knowledge Graph — no backend is changed.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            Each category accepts only the formats shown on its card
          </span>
        </div>
        <div className="grid items-start gap-4 xl:grid-cols-2">
          {ARTIFACTS.map((artifact) => {
            const Icon = artifact.icon;
            const files = uploads[artifact.id] ?? [];
            return (
              <div
                key={artifact.id}
                className={`rounded-lg border border-border border-l-4 bg-white p-4 shadow-sm ${artifact.accent}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-md ${artifact.iconColour}`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold">{artifact.label}</h3>
                      <p className="text-[11px] text-muted-foreground">{artifact.description}</p>
                      <p className="mt-0.5 text-[10px] font-medium text-slate-500">
                        Allowed: {artifact.allowedExtensions.join(', ')}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => inputs.current[artifact.id]?.click()}
                  >
                    <Upload className="h-3.5 w-3.5" /> Upload
                  </Button>
                </div>
                <input
                  ref={(node) => {
                    inputs.current[artifact.id] = node;
                  }}
                  className="hidden"
                  type="file"
                  multiple
                  accept={artifact.allowedExtensions.join(',')}
                  onChange={(event) => addFiles(artifact, event)}
                />
                {files.length ? (
                  <div className="mt-3 space-y-1">
                    {files.map((file, index) => (
                      <div
                        key={`${file}-${index}`}
                        className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600"
                      >
                        <span className="truncate">{file}</span>
                        <button
                          type="button"
                          className="text-slate-400 hover:text-rose-600"
                          aria-label={`Remove ${file}`}
                          onClick={() => removeFile(artifact.id, file)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-slate-400">No files uploaded</p>
                )}
                {uploadErrors[artifact.id] ? (
                  <p role="alert" className="mt-2 text-xs text-rose-600">
                    {uploadErrors[artifact.id]}
                  </p>
                ) : null}
                <details className="mt-4 border-t border-slate-100 pt-3">
                  <summary className="cursor-pointer text-xs font-semibold text-[#00338D] marker:text-[#00338D]">
                    Configure LLM analysis
                  </summary>
                  <div className="pt-3">
                    <label
                      htmlFor={`${artifact.id}-prompt`}
                      className="mb-1.5 block text-xs font-medium text-slate-700"
                    >
                      {artifact.label} analysis prompt
                    </label>
                    <textarea
                      id={`${artifact.id}-prompt`}
                      value={prompts[artifact.id] ?? ''}
                      onChange={(event) =>
                        setPrompts((previous) => ({
                          ...previous,
                          [artifact.id]: event.target.value,
                        }))
                      }
                      placeholder={`What should the model reverse engineer from these ${artifact.label} files?`}
                      className="min-h-20 w-full rounded-md border border-slate-300 p-3 text-xs outline-none transition placeholder:text-slate-400 focus:border-[#00338D] focus:ring-2 focus:ring-blue-100"
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="mt-3 w-full bg-[#00338D] hover:bg-[#002a73]"
                      onClick={() => generateOutput(artifact)}
                    >
                      <Send className="h-3.5 w-3.5" /> Generate {artifact.label} analysis
                    </Button>
                    <div className="mt-3 rounded-md border border-dashed border-slate-300 bg-slate-50 p-3">
                      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> {artifact.label}{' '}
                        response
                      </div>
                      <p className="text-xs leading-5 text-slate-500">
                        {outputs[artifact.id] ??
                          'Generated output for this artifact type will appear here.'}
                      </p>
                    </div>
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      </section>

      <section
        className="mt-7 rounded-lg border border-blue-100 bg-blue-50/60 p-5"
        aria-labelledby="knowledge-graph-heading"
      >
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <h2 id="knowledge-graph-heading" className="text-base font-semibold text-slate-800">
              Combined output → Knowledge Graph
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Every generated artifact response is combined locally and reflected in the Knowledge
              Graph workspace. Backend graph data is not modified.
            </p>
          </div>
          <NavLink
            to="/graph"
            className="shrink-0 rounded-md bg-[#00338D] px-3 py-2 text-xs font-medium text-white hover:bg-[#002a73]"
          >
            Open Knowledge Graph
          </NavLink>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {KNOWLEDGE_GRAPH_DESTINATIONS.map((destination) => (
            <div
              key={destination}
              className="rounded-md border border-blue-100 bg-white px-3 py-2 text-xs font-medium text-slate-700"
            >
              {destination}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
