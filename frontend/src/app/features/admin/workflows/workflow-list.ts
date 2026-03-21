import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

type Tab = 'pending' | 'definitions';

@Component({
  selector: 'app-workflow-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">Workflows</h1>
          <p class="page-sub">Approval queues and process automation</p>
        </div>
      </div>

      <!-- Stats -->
      @if (stats()) {
        <div class="stats-grid">
          <div class="stat"><span class="val">{{ stats().total }}</span><span class="lbl">Total</span></div>
          <div class="stat warn"><span class="val">{{ stats().pending }}</span><span class="lbl">Pending</span></div>
          <div class="stat ok"><span class="val">{{ stats().completed }}</span><span class="lbl">Completed</span></div>
        </div>
      }

      <div class="tabs">
        <button class="tab" [class.active]="activeTab() === 'pending'" (click)="activeTab.set('pending'); loadPending()">Approval Queue</button>
        <button class="tab" [class.active]="activeTab() === 'definitions'" (click)="activeTab.set('definitions'); loadDefinitions()">Definitions</button>
      </div>

      <!-- Pending Instances -->
      @if (activeTab() === 'pending') {
        @if (instances().length === 0) {
          <div class="empty">No pending workflows.</div>
        } @else {
          <div class="instance-list">
            @for (inst of instances(); track inst._id) {
              <div class="instance-card">
                <div class="inst-header">
                  <div>
                    <span class="inst-slug">{{ inst.definitionSlug }}</span>
                    <span class="inst-resource">{{ inst.resourceType }}:{{ inst.resourceId }}</span>
                  </div>
                  <span class="inst-state">{{ inst.currentState }}</span>
                </div>
                <div class="inst-meta">
                  <span>By: {{ inst.createdBy?.firstName || inst.createdBy?.phone || '—' }}</span>
                  <span>{{ inst.createdAt | date:'dd MMM, h:mm a' }}</span>
                </div>
                <!-- Available transitions -->
                <div class="inst-actions">
                  <button class="btn-sm" (click)="loadTransitions(inst._id)">Actions</button>
                </div>
                @if (selectedInstance() === inst._id && transitions().length > 0) {
                  <div class="transition-bar">
                    @for (t of transitions(); track t.to) {
                      <button class="btn-transition" (click)="applyTransition(inst._id, t.to)">{{ t.label }}</button>
                    }
                    <input class="note-input" [(ngModel)]="transitionNote" placeholder="Note (optional)" />
                  </div>
                }
                <!-- History -->
                @if (inst.history && inst.history.length > 1) {
                  <div class="history">
                    @for (h of inst.history; track h.timestamp) {
                      <div class="history-entry">
                        <span class="h-arrow">{{ h.fromState }} → {{ h.toState }}</span>
                        <span class="h-time">{{ h.timestamp | date:'dd MMM, h:mm a' }}</span>
                        @if (h.note) { <span class="h-note">{{ h.note }}</span> }
                      </div>
                    }
                  </div>
                }
              </div>
            }
          </div>
        }
      }

      <!-- Definitions -->
      @if (activeTab() === 'definitions') {
        <div class="toolbar"><button class="btn-add" (click)="showDefModal.set(true)">+ Create Definition</button></div>
        @for (def of definitions(); track def._id) {
          <div class="def-card">
            <div class="def-info">
              <strong>{{ def.name }}</strong>
              <span class="def-slug">{{ def.slug }}</span>
              <span class="def-states">States: {{ def.states.join(' → ') }}</span>
            </div>
            <button class="btn-sm danger" (click)="deleteDefinition(def._id)">Delete</button>
          </div>
        }

        <!-- Create Definition Modal -->
        @if (showDefModal()) {
          <div class="backdrop" (click)="showDefModal.set(false)"></div>
          <div class="modal">
            <div class="modal-head"><h2>Create Workflow</h2><button (click)="showDefModal.set(false)">✕</button></div>
            <div class="modal-body">
              <div class="form-field"><label>Name</label><input [(ngModel)]="defForm.name" placeholder="Return Request" /></div>
              <div class="form-field"><label>States (comma separated)</label><input [(ngModel)]="defForm.statesStr" placeholder="submitted, under_review, approved, rejected" /></div>
              <div class="form-field"><label>Initial State</label><input [(ngModel)]="defForm.initialState" placeholder="submitted" /></div>
              <div class="form-field"><label>Final States (comma separated)</label><input [(ngModel)]="defForm.finalStatesStr" placeholder="approved, rejected" /></div>
              <div class="modal-actions">
                <button (click)="showDefModal.set(false)">Cancel</button>
                <button class="btn-save" (click)="saveDefinition()">Create</button>
              </div>
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;
    .page { padding: $space-xl; }
    .page-title { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; margin:0 0 $space-xxs; }
    .page-sub { font-size: $font-size-sm; color: $color-text-tertiary; margin:0 0 $space-xl; }
    .stats-grid { display:grid; grid-template-columns: repeat(3,1fr); gap: $space-md; margin-bottom: $space-xl; }
    .stat { padding: $space-lg; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-xl; text-align:center; &.warn { border-color:rgba(204,88,3,.3); } &.ok { border-color:rgba(87,136,108,.3); } }
    .val { display:block; font-size: $font-size-xl; font-weight: $font-weight-bold; color: $color-text-primary; .warn & { color: $color-warning; } .ok & { color: $color-success; } }
    .lbl { font-size: $font-size-xs; color: $color-text-tertiary; text-transform:uppercase; }
    .tabs { display:flex; gap: $space-xs; margin-bottom: $space-lg; border-bottom:2px solid $color-border-light; padding-bottom: $space-xs; }
    .tab { padding: $space-sm $space-lg; border:none; background:transparent; font-size: $font-size-sm; color: $color-text-tertiary; cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-3px; &.active { color: $color-primary; border-bottom-color: $color-primary; } }
    .empty { text-align:center; color: $color-text-tertiary; padding: $space-xxl; }
    .instance-list { display:flex; flex-direction:column; gap: $space-md; }
    .instance-card { padding: $space-lg; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-xl; }
    .inst-header { display:flex; justify-content:space-between; align-items:center; margin-bottom: $space-sm; }
    .inst-slug { font-weight: $font-weight-bold; color: $color-primary; margin-right: $space-sm; }
    .inst-resource { font-size: $font-size-xs; color: $color-text-tertiary; font-family:monospace; }
    .inst-state { padding:2px $space-sm; background:rgba(204,88,3,.1); color: $color-primary; border-radius: $radius-full; font-size: $font-size-xs; font-weight: $font-weight-bold; text-transform:uppercase; }
    .inst-meta { font-size: $font-size-xs; color: $color-text-tertiary; display:flex; gap: $space-lg; margin-bottom: $space-sm; }
    .inst-actions { margin-bottom: $space-sm; }
    .btn-sm { padding: $space-xxs $space-sm; border:1px solid $color-border; border-radius: $radius-md; background:transparent; font-size: $font-size-xs; cursor:pointer; &:hover { border-color: $color-primary; color: $color-primary; } &.danger:hover { border-color: $color-error; color: $color-error; } }
    .transition-bar { display:flex; gap: $space-sm; align-items:center; padding: $space-sm; background: $color-bg-secondary; border-radius: $radius-md; margin-bottom: $space-sm; }
    .btn-transition { padding: $space-xs $space-md; background: $color-success; color: $color-text-inverse; border:none; border-radius: $radius-md; font-size: $font-size-xs; font-weight: $font-weight-semibold; cursor:pointer; &:hover { opacity:.9; } }
    .note-input { flex:1; padding: $space-xs $space-sm; border:1px solid $color-border; border-radius: $radius-md; font-size: $font-size-xs; outline:none; font-family: $font-family; }
    .history { padding-top: $space-sm; border-top:1px solid $color-border-light; }
    .history-entry { display:flex; gap: $space-md; font-size: $font-size-xs; color: $color-text-tertiary; padding: $space-xxs 0; }
    .h-arrow { font-family:monospace; color: $color-text-secondary; }
    .h-note { font-style:italic; }
    .toolbar { margin-bottom: $space-lg; }
    .btn-add { padding: $space-sm $space-lg; background: $color-primary; color: $color-text-inverse; border:none; border-radius: $radius-md; font-size: $font-size-sm; font-weight: $font-weight-semibold; cursor:pointer; }
    .def-card { display:flex; align-items:center; justify-content:space-between; padding: $space-md $space-lg; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-lg; margin-bottom: $space-sm; }
    .def-info { display:flex; flex-direction:column; gap:2px; }
    .def-slug { font-size: $font-size-xs; color: $color-text-tertiary; font-family:monospace; }
    .def-states { font-size: $font-size-xs; color: $color-accent; }
    .backdrop { position:fixed; inset:0; background:rgba(58,45,50,.4); backdrop-filter:blur(4px); z-index: $z-modal-backdrop; }
    .modal { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:500px; max-width:90vw; background: $color-bg-tertiary; border-radius: $radius-xl; box-shadow: $shadow-xl; z-index: $z-modal; }
    .modal-head { display:flex; align-items:center; justify-content:space-between; padding: $space-lg $space-xl; border-bottom:1px solid $color-border-light; h2 { font-size: $font-size-lg; font-weight: $font-weight-bold; margin:0; } button { width:32px; height:32px; border-radius: $radius-md; border:1px solid $color-border-light; background:transparent; cursor:pointer; display:flex; align-items:center; justify-content:center; } }
    .modal-body { padding: $space-xl; }
    .form-field { display:flex; flex-direction:column; gap: $space-xs; margin-bottom: $space-md; label { font-size: $font-size-xs; font-weight: $font-weight-semibold; color: $color-text-tertiary; text-transform:uppercase; } input { width:100%; padding: $space-sm $space-md; border:1px solid $color-border; border-radius: $radius-md; font-size: $font-size-sm; background: $color-bg-secondary; outline:none; font-family: $font-family; box-sizing:border-box; &:focus { border-color: $color-primary; } } }
    .modal-actions { display:flex; justify-content:flex-end; gap: $space-md; margin-top: $space-lg; button { padding: $space-sm $space-lg; border:1px solid $color-border; border-radius: $radius-md; background:transparent; font-size: $font-size-sm; cursor:pointer; } }
    .btn-save { background: $color-primary !important; color: $color-text-inverse !important; border:none !important; }
  `],
})
export class WorkflowListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly activeTab = signal<Tab>('pending');
  readonly instances = signal<any[]>([]);
  readonly definitions = signal<any[]>([]);
  readonly stats = signal<any>(null);
  readonly transitions = signal<any[]>([]);
  readonly selectedInstance = signal<string | null>(null);
  readonly showDefModal = signal(false);

  transitionNote = '';
  defForm = { name: '', statesStr: '', initialState: '', finalStatesStr: '' };

  ngOnInit(): void {
    this.loadStats();
    this.loadPending();
  }

  loadStats(): void {
    this.http.get<{ data: any }>(`${this.api}/admin/workflows/stats`).subscribe({
      next: (res) => this.stats.set(res.data),
    });
  }

  loadPending(): void {
    this.http.get<{ data: any[] }>(`${this.api}/admin/workflows/pending?limit=50`).subscribe({
      next: (res) => this.instances.set(res.data),
    });
  }

  loadDefinitions(): void {
    this.http.get<{ data: any[] }>(`${this.api}/admin/workflows/definitions`).subscribe({
      next: (res) => this.definitions.set(res.data),
    });
  }

  loadTransitions(instanceId: string): void {
    if (this.selectedInstance() === instanceId) { this.selectedInstance.set(null); return; }
    this.selectedInstance.set(instanceId);
    this.transitionNote = '';
    this.http.get<{ data: any[] }>(`${this.api}/admin/workflows/instances/${instanceId}/transitions`).subscribe({
      next: (res) => this.transitions.set(res.data),
    });
  }

  applyTransition(instanceId: string, toState: string): void {
    this.http.post(`${this.api}/admin/workflows/instances/${instanceId}/transition`, {
      toState, note: this.transitionNote || undefined,
    }).subscribe({
      next: () => { this.selectedInstance.set(null); this.loadPending(); this.loadStats(); },
    });
  }

  saveDefinition(): void {
    const states = this.defForm.statesStr.split(',').map((s) => s.trim()).filter(Boolean);
    const finalStates = this.defForm.finalStatesStr.split(',').map((s) => s.trim()).filter(Boolean);
    // Auto-generate transitions: each state → next state
    const transitions = [];
    for (let i = 0; i < states.length - 1; i++) {
      transitions.push({ from: states[i], to: states[i + 1], requiredRole: 'admin', label: `Move to ${states[i + 1]}` });
    }
    // Add reject transition from non-final states to last final state (if exists)
    const rejectState = finalStates.find((s) => s.includes('reject'));
    if (rejectState) {
      for (const state of states) {
        if (!finalStates.includes(state) && state !== this.defForm.initialState) {
          transitions.push({ from: state, to: rejectState, requiredRole: 'admin', label: 'Reject' });
        }
      }
    }

    this.http.post(`${this.api}/admin/workflows/definitions`, {
      name: this.defForm.name,
      states,
      initialState: this.defForm.initialState,
      finalStates,
      transitions,
    }).subscribe({
      next: () => { this.showDefModal.set(false); this.loadDefinitions(); },
    });
  }

  deleteDefinition(id: string): void {
    if (!confirm('Delete?')) return;
    this.http.delete(`${this.api}/admin/workflows/definitions/${id}`).subscribe({ next: () => this.loadDefinitions() });
  }
}
