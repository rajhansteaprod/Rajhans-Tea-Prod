import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-experiment-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div><h1 class="page-title">A/B Experiments</h1><p class="page-sub">Run controlled experiments safely</p></div>
        <button class="btn-add" (click)="openCreate()">+ New Experiment</button>
      </div>

      @for (exp of experiments(); track exp._id) {
        <div class="exp-card" [class.running]="exp.status === 'running'" [class.completed]="exp.status === 'completed'">
          <div class="exp-header">
            <div>
              <span class="exp-name">{{ exp.name }}</span>
              <span class="exp-slug">{{ exp.slug }}</span>
            </div>
            <span class="exp-status" [attr.data-status]="exp.status">{{ exp.status }}</span>
          </div>
          <div class="exp-variants">
            @for (v of exp.variants; track v.key) {
              <span class="variant-pill">{{ v.key }}: {{ v.weight }}%</span>
            }
            <span class="exp-metric">Metric: {{ exp.targetMetric }}</span>
          </div>
          <div class="exp-actions">
            @if (exp.status === 'draft') {
              <button class="btn-sm start" (click)="start(exp._id)">Start</button>
            }
            @if (exp.status === 'running') {
              <button class="btn-sm stop" (click)="stop(exp._id)">Stop</button>
              <button class="btn-sm" (click)="loadResults(exp.slug)">Results</button>
            }
            @if (exp.status === 'completed') {
              <button class="btn-sm" (click)="loadResults(exp.slug)">View Results</button>
            }
            <button class="btn-sm danger" (click)="deleteExp(exp._id)">Delete</button>
          </div>

          @if (results()?.experiment?.slug === exp.slug) {
            <div class="results-panel">
              <h4>Results</h4>
              <div class="results-table">
                @for (v of results().variants; track v.key) {
                  <div class="result-row">
                    <span class="r-variant">{{ v.key }}</span>
                    <span>{{ v.exposures }} exposures</span>
                    <span>{{ v.conversions }} conversions</span>
                    <span class="r-rate">{{ v.conversionRate }}%</span>
                    <span class="r-revenue">₹{{ v.revenue | number:'1.0-0' }}</span>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      }

      <!-- Create Modal -->
      @if (showModal()) {
        <div class="backdrop" (click)="showModal.set(false)"></div>
        <div class="modal">
          <div class="modal-head"><h2>New Experiment</h2><button (click)="showModal.set(false)">✕</button></div>
          <div class="modal-body">
            <div class="form-field"><label>Name</label><input [(ngModel)]="form.name" placeholder="New Checkout Flow" /></div>
            <div class="form-field"><label>Description</label><input [(ngModel)]="form.description" /></div>
            <div class="form-field"><label>Target Metric</label>
              <select [(ngModel)]="form.targetMetric"><option value="conversion_rate">Conversion Rate</option><option value="revenue">Revenue</option><option value="aov">Avg Order Value</option></select>
            </div>
            <div class="form-field"><label>Variants (2 minimum)</label>
              @for (v of form.variants; track $index; let i = $index) {
                <div class="variant-row">
                  <input [(ngModel)]="v.key" placeholder="control / variant_a" />
                  <input type="number" [(ngModel)]="v.weight" min="0" max="100" placeholder="50" />
                  <span>%</span>
                  @if (form.variants.length > 2) { <button class="btn-x" (click)="form.variants.splice(i, 1)">✕</button> }
                </div>
              }
              <button class="btn-add-variant" (click)="form.variants.push({key:'',weight:0,description:''})">+ Add Variant</button>
            </div>
            <div class="modal-actions"><button (click)="showModal.set(false)">Cancel</button><button class="btn-save" (click)="save()">Create</button></div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;
    .page { padding: $space-xl; }
    .page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom: $space-xl; }
    .page-title { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; margin:0 0 $space-xxs; }
    .page-sub { font-size: $font-size-sm; color: $color-text-tertiary; margin:0; }
    .btn-add { padding: $space-sm $space-lg; background: $color-primary; color: $color-text-inverse; border:none; border-radius: $radius-md; font-size: $font-size-sm; font-weight: $font-weight-semibold; cursor:pointer; }

    .exp-card { padding: $space-lg $space-xl; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-xl; margin-bottom: $space-md;
      &.running { border-left:4px solid $color-success; }
      &.completed { border-left:4px solid $color-accent; }
    }
    .exp-header { display:flex; justify-content:space-between; align-items:center; margin-bottom: $space-sm; }
    .exp-name { font-size: $font-size-md; font-weight: $font-weight-bold; color: $color-text-primary; }
    .exp-slug { font-size: $font-size-xs; font-family:monospace; color: $color-text-tertiary; margin-left: $space-sm; }
    .exp-status { padding:2px $space-sm; border-radius: $radius-full; font-size:10px; font-weight: $font-weight-bold; text-transform:uppercase;
      &[data-status="draft"] { background:rgba(204,88,3,.1); color: $color-primary; }
      &[data-status="running"] { background:rgba(87,136,108,.12); color: $color-success; }
      &[data-status="completed"] { background:rgba(162,126,142,.12); color: $color-accent; }
    }
    .exp-variants { display:flex; align-items:center; gap: $space-sm; margin-bottom: $space-sm; flex-wrap:wrap; }
    .variant-pill { padding:2px $space-sm; background: $color-bg-secondary; border-radius: $radius-full; font-size: $font-size-xs; font-weight: $font-weight-semibold; color: $color-text-secondary; }
    .exp-metric { font-size: $font-size-xs; color: $color-text-tertiary; }
    .exp-actions { display:flex; gap: $space-sm; }
    .btn-sm { padding: $space-xxs $space-sm; border:1px solid $color-border; border-radius: $radius-md; background:transparent; font-size: $font-size-xs; cursor:pointer;
      &:hover { border-color: $color-primary; color: $color-primary; }
      &.start { border-color: $color-success; color: $color-success; }
      &.stop { border-color: $color-error; color: $color-error; }
      &.danger:hover { border-color: $color-error; color: $color-error; }
    }

    .results-panel { margin-top: $space-md; padding-top: $space-md; border-top:1px solid $color-border-light;
      h4 { font-size: $font-size-sm; font-weight: $font-weight-semibold; color: $color-text-secondary; margin:0 0 $space-sm; }
    }
    .results-table { display:flex; flex-direction:column; gap: $space-xs; }
    .result-row { display:grid; grid-template-columns: 100px repeat(4,1fr); gap: $space-md; font-size: $font-size-sm; padding: $space-xs 0; border-bottom:1px solid $color-border-light; }
    .r-variant { font-weight: $font-weight-bold; color: $color-text-primary; }
    .r-rate { font-weight: $font-weight-bold; color: $color-success; }
    .r-revenue { font-weight: $font-weight-bold; color: $color-primary; }

    .backdrop { position:fixed; inset:0; background:rgba(58,45,50,.4); backdrop-filter:blur(4px); z-index: $z-modal-backdrop; }
    .modal { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:500px; max-width:90vw; max-height:85vh; overflow-y:auto; background: $color-bg-tertiary; border-radius: $radius-xl; box-shadow: $shadow-xl; z-index: $z-modal; }
    .modal-head { display:flex; align-items:center; justify-content:space-between; padding: $space-lg $space-xl; border-bottom:1px solid $color-border-light; h2 { font-size: $font-size-lg; font-weight: $font-weight-bold; margin:0; } button { width:32px; height:32px; border-radius: $radius-md; border:1px solid $color-border-light; background:transparent; cursor:pointer; display:flex; align-items:center; justify-content:center; } }
    .modal-body { padding: $space-xl; }
    .form-field { display:flex; flex-direction:column; gap: $space-xs; margin-bottom: $space-md; label { font-size: $font-size-xs; font-weight: $font-weight-semibold; color: $color-text-tertiary; text-transform:uppercase; } input, select { width:100%; padding: $space-sm $space-md; border:1px solid $color-border; border-radius: $radius-md; font-size: $font-size-sm; background: $color-bg-secondary; outline:none; font-family: $font-family; box-sizing:border-box; &:focus { border-color: $color-primary; } } }
    .variant-row { display:flex; gap: $space-xs; align-items:center; margin-bottom: $space-xs; input:first-child { flex:2; } input:nth-child(2) { flex:1; } span { font-size: $font-size-sm; color: $color-text-tertiary; } }
    .btn-x { width:24px; height:24px; border:none; background:transparent; color: $color-error; cursor:pointer; font-size: $font-size-md; }
    .btn-add-variant { border:none; background:transparent; color: $color-primary; font-size: $font-size-xs; cursor:pointer; font-weight: $font-weight-semibold; padding: $space-xxs 0; }
    .modal-actions { display:flex; justify-content:flex-end; gap: $space-md; margin-top: $space-lg; button { padding: $space-sm $space-lg; border:1px solid $color-border; border-radius: $radius-md; background:transparent; font-size: $font-size-sm; cursor:pointer; } }
    .btn-save { background: $color-primary !important; color: $color-text-inverse !important; border:none !important; }
  `],
})
export class ExperimentListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly experiments = signal<any[]>([]);
  readonly results = signal<any>(null);
  readonly showModal = signal(false);
  form: any = { name: '', description: '', targetMetric: 'conversion_rate', variants: [{ key: 'control', weight: 50, description: '' }, { key: 'variant_a', weight: 50, description: '' }] };

  ngOnInit(): void { this.load(); }

  load(): void { this.http.get<{ data: any[] }>(`${this.api}/admin/experiments`).subscribe({ next: (r) => this.experiments.set(r.data) }); }

  openCreate(): void {
    this.form = { name: '', description: '', targetMetric: 'conversion_rate', variants: [{ key: 'control', weight: 50, description: '' }, { key: 'variant_a', weight: 50, description: '' }] };
    this.showModal.set(true);
  }

  save(): void {
    this.http.post(`${this.api}/admin/experiments`, this.form).subscribe({ next: () => { this.showModal.set(false); this.load(); } });
  }

  start(id: string): void { this.http.post(`${this.api}/admin/experiments/${id}/start`, {}).subscribe({ next: () => this.load() }); }
  stop(id: string): void { this.http.post(`${this.api}/admin/experiments/${id}/stop`, {}).subscribe({ next: () => this.load() }); }
  deleteExp(id: string): void { if (confirm('Delete?')) this.http.delete(`${this.api}/admin/experiments/${id}`).subscribe({ next: () => this.load() }); }

  loadResults(slug: string): void {
    if (this.results()?.experiment?.slug === slug) { this.results.set(null); return; }
    this.http.get<{ data: any }>(`${this.api}/admin/experiments/${slug}/results`).subscribe({ next: (r) => this.results.set(r.data) });
  }
}
