import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  PricingService,
  PriceRule,
  TaxRule,
  QuantityTier,
  PriceRuleType,
  PriceRuleScope,
  CreatePriceRulePayload,
  CreateTaxRulePayload,
} from '../../../core/services/pricing.service';
import { CatalogService, Category } from '../../../core/services/catalog.service';

// ─── Forms ────────────────────────────────────────────────────────────────────

interface PriceRuleForm {
  name: string;
  type: PriceRuleType;
  scope: PriceRuleScope;
  productId: string;
  categoryId: string;
  collectionId: string;
  tiers: QuantityTier[];
  discountPercent: number | null;
  fixedPrice: number | null;
  priority: number;
  isActive: boolean;
}

interface TaxRuleForm {
  name: string;
  categoryId: string;
  rate: number;
  isInclusive: boolean;
  isActive: boolean;
}

const emptyPriceRuleForm = (): PriceRuleForm => ({
  name: '',
  type: 'quantity_tier',
  scope: 'product',
  productId: '',
  categoryId: '',
  collectionId: '',
  tiers: [
    { minQty: 1, maxQty: 2, discountPercent: 0 },
    { minQty: 3, maxQty: 5, discountPercent: 10 },
    { minQty: 6, maxQty: null, discountPercent: 20 },
  ],
  discountPercent: null,
  fixedPrice: null,
  priority: 0,
  isActive: true,
});

const emptyTaxRuleForm = (): TaxRuleForm => ({
  name: '',
  categoryId: '',
  rate: 18,
  isInclusive: true,
  isActive: true,
});

@Component({
  selector: 'app-pricing-rules',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="pricing-page">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Pricing Engine</h1>
          <p class="page-subtitle">Manage discount rules and tax configuration</p>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tabs">
        <button
          class="tab"
          [class.active]="activeTab() === 'rules'"
          (click)="activeTab.set('rules')"
        >
          Price Rules
          @if (priceRules().length) {
            <span class="tab-badge">{{ priceRules().length }}</span>
          }
        </button>
        <button class="tab" [class.active]="activeTab() === 'tax'" (click)="activeTab.set('tax')">
          Tax Rules
          @if (taxRules().length) {
            <span class="tab-badge">{{ taxRules().length }}</span>
          }
        </button>
      </div>

      @if (loading()) {
        <div class="loading-state">Loading…</div>
      }

      <!-- ── PRICE RULES TAB ──────────────────────────────────── -->
      @if (activeTab() === 'rules' && !loading()) {
        <div class="section">
          <div class="section-header">
            <span class="section-count">{{ priceRules().length }} rules</span>
            <button class="btn-primary" (click)="openCreateRule()">+ Add Rule</button>
          </div>

          @if (priceRules().length === 0) {
            <div class="empty-state">
              <p>No price rules yet. Create one to start applying discounts.</p>
            </div>
          } @else {
            <div class="rules-list">
              @for (rule of priceRules(); track rule._id) {
                <div class="rule-card" [class.inactive]="!rule.isActive">
                  <div class="rule-card-header">
                    <div class="rule-meta">
                      <span class="rule-name">{{ rule.name }}</span>
                      <div class="rule-badges">
                        <span class="badge badge-type">{{ rule.type | titlecase }}</span>
                        <span class="badge badge-scope">{{ rule.scope | titlecase }}</span>
                        <span
                          class="badge"
                          [class.badge-active]="rule.isActive"
                          [class.badge-inactive]="!rule.isActive"
                        >
                          {{ rule.isActive ? 'Active' : 'Inactive' }}
                        </span>
                        <span class="badge badge-priority">P{{ rule.priority }}</span>
                      </div>
                    </div>
                    <div class="rule-actions">
                      <button class="btn-icon" (click)="openEditRule(rule)" title="Edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                          />
                          <path
                            d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                          />
                        </svg>
                      </button>
                      <button
                        class="btn-icon btn-icon-danger"
                        (click)="deleteRule(rule._id)"
                        title="Delete"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <polyline
                            points="3 6 5 6 21 6"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                          />
                          <path
                            d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <!-- Rule details -->
                  @if (rule.type === 'quantity_tier' && rule.tiers?.length) {
                    <div class="tiers-display">
                      @for (tier of rule.tiers; track tier.minQty) {
                        <div class="tier-chip">
                          {{ tier.minQty }}{{ tier.maxQty ? '–' + tier.maxQty : '+' }} qty
                          <strong>→ {{ tier.discountPercent }}% off</strong>
                        </div>
                      }
                    </div>
                  }
                  @if (rule.type === 'percentage') {
                    <p class="rule-detail">{{ rule.discountPercent }}% off all qualifying items</p>
                  }
                  @if (rule.type === 'fixed_price') {
                    <p class="rule-detail">Fixed price: ₹{{ rule.fixedPrice }}</p>
                  }
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- ── TAX RULES TAB ────────────────────────────────────── -->
      @if (activeTab() === 'tax' && !loading()) {
        <div class="section">
          <div class="section-header">
            <span class="section-count">{{ taxRules().length }} rules</span>
            <button class="btn-primary" (click)="openCreateTax()">+ Add Tax Rule</button>
          </div>

          @if (taxRules().length === 0) {
            <div class="empty-state">
              <p>No tax rules yet. Add a global default GST rule to get started.</p>
            </div>
          } @else {
            <div class="rules-list">
              @for (tax of taxRules(); track tax._id) {
                <div class="rule-card" [class.inactive]="!tax.isActive">
                  <div class="rule-card-header">
                    <div class="rule-meta">
                      <span class="rule-name">{{ tax.name }}</span>
                      <div class="rule-badges">
                        <span class="badge badge-type">{{ tax.rate }}% GST</span>
                        <span class="badge badge-scope">{{
                          tax.categoryId ? 'Category' : 'Global'
                        }}</span>
                        <span
                          class="badge"
                          [class.badge-active]="tax.isActive"
                          [class.badge-inactive]="!tax.isActive"
                        >
                          {{ tax.isActive ? 'Active' : 'Inactive' }}
                        </span>
                        <span class="badge badge-priority">{{
                          tax.isInclusive ? 'Inclusive' : 'Exclusive'
                        }}</span>
                      </div>
                    </div>
                    <div class="rule-actions">
                      <button class="btn-icon" (click)="openEditTax(tax)" title="Edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                          />
                          <path
                            d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                          />
                        </svg>
                      </button>
                      <button
                        class="btn-icon btn-icon-danger"
                        (click)="deleteTax(tax._id)"
                        title="Delete"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <polyline
                            points="3 6 5 6 21 6"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                          />
                          <path
                            d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <p class="rule-detail">
                    Tax is {{ tax.isInclusive ? 'included in' : 'added on top of' }} the listed
                    price
                  </p>
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- ── PRICE RULE MODAL ─────────────────────────────────── -->
      @if (showRuleModal()) {
        <div class="modal-overlay" (click)="closeRuleModal()">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h2>{{ editingRuleId() ? 'Edit' : 'New' }} Price Rule</h2>
              <button class="modal-close" (click)="closeRuleModal()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M18 6L6 18M6 6l12 12"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                </svg>
              </button>
            </div>

            @if (formError()) {
              <div class="form-error">{{ formError() }}</div>
            }

            <div class="modal-body">
              <div class="form-row">
                <div class="form-field">
                  <label class="form-label">Rule Name *</label>
                  <input
                    class="form-input"
                    [(ngModel)]="ruleForm().name"
                    placeholder="e.g. Bulk Quantity Discount"
                  />
                </div>
                <div class="form-field">
                  <label class="form-label">Priority</label>
                  <input
                    class="form-input"
                    type="number"
                    [(ngModel)]="ruleForm().priority"
                    min="0"
                  />
                </div>
              </div>

              <div class="form-row">
                <div class="form-field">
                  <label class="form-label">Type *</label>
                  <select class="form-input" [(ngModel)]="ruleForm().type">
                    <option value="quantity_tier">Quantity Tier</option>
                    <option value="percentage">Flat Percentage</option>
                    <option value="fixed_price">Fixed Sale Price</option>
                  </select>
                </div>
                <div class="form-field">
                  <label class="form-label">Scope *</label>
                  <select class="form-input" [(ngModel)]="ruleForm().scope">
                    <option value="global">Global (all products)</option>
                    <option value="product">Specific Product</option>
                    <option value="category">Category</option>
                    <option value="collection">Collection</option>
                  </select>
                </div>
              </div>

              <!-- Scope ID field -->
              @if (ruleForm().scope === 'product') {
                <div class="form-field">
                  <label class="form-label">Product ID</label>
                  <input
                    class="form-input"
                    [(ngModel)]="ruleForm().productId"
                    placeholder="MongoDB ObjectId of the product"
                  />
                </div>
              }
              @if (ruleForm().scope === 'category') {
                <div class="form-field">
                  <label class="form-label">Category</label>
                  <select class="form-input" [(ngModel)]="ruleForm().categoryId">
                    <option value="">— Select —</option>
                    @for (cat of categories(); track cat._id) {
                      <option [value]="cat._id">{{ cat.name }}</option>
                    }
                  </select>
                </div>
              }

              <!-- Type-specific fields -->
              @if (ruleForm().type === 'quantity_tier') {
                <div class="tiers-section">
                  <div class="tiers-header">
                    <label class="form-label">Quantity Tiers</label>
                    <button type="button" class="btn-add-tier" (click)="addTier()">
                      + Add Tier
                    </button>
                  </div>
                  <div class="tiers-table-header">
                    <span>Min Qty</span>
                    <span>Max Qty</span>
                    <span>Discount %</span>
                    <span></span>
                  </div>
                  @for (tier of ruleForm().tiers; track $index; let i = $index) {
                    <div class="tier-row">
                      <input
                        class="form-input tier-input"
                        type="number"
                        [(ngModel)]="tier.minQty"
                        min="1"
                        placeholder="1"
                      />
                      <input
                        class="form-input tier-input"
                        type="number"
                        [(ngModel)]="tier.maxQty"
                        min="1"
                        placeholder="∞ (leave blank)"
                      />
                      <input
                        class="form-input tier-input"
                        type="number"
                        [(ngModel)]="tier.discountPercent"
                        min="0"
                        max="100"
                        placeholder="0"
                      />
                      <button
                        type="button"
                        class="btn-remove-tier"
                        (click)="removeTier(i)"
                        [disabled]="ruleForm().tiers.length <= 1"
                      >
                        ×
                      </button>
                    </div>
                  }
                  <p class="tier-hint">Leave Max Qty blank for unlimited (6+)</p>
                </div>
              }

              @if (ruleForm().type === 'percentage') {
                <div class="form-field">
                  <label class="form-label">Discount Percentage *</label>
                  <input
                    class="form-input"
                    type="number"
                    [(ngModel)]="ruleForm().discountPercent"
                    min="0"
                    max="100"
                    placeholder="e.g. 10"
                  />
                </div>
              }

              @if (ruleForm().type === 'fixed_price') {
                <div class="form-field">
                  <label class="form-label">Fixed Sale Price (₹) *</label>
                  <input
                    class="form-input"
                    type="number"
                    [(ngModel)]="ruleForm().fixedPrice"
                    min="0"
                    placeholder="e.g. 799"
                  />
                </div>
              }

              <div class="form-field">
                <label class="form-label toggle-label">
                  <input type="checkbox" [(ngModel)]="ruleForm().isActive" />
                  Active
                </label>
              </div>
            </div>

            <div class="modal-footer">
              <button class="btn-cancel" (click)="closeRuleModal()">Cancel</button>
              <button class="btn-primary" (click)="saveRule()" [disabled]="saving()">
                {{ saving() ? 'Saving…' : editingRuleId() ? 'Update Rule' : 'Create Rule' }}
              </button>
            </div>
          </div>
        </div>
      }

      <!-- ── TAX RULE MODAL ───────────────────────────────────── -->
      @if (showTaxModal()) {
        <div class="modal-overlay" (click)="closeTaxModal()">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h2>{{ editingTaxId() ? 'Edit' : 'New' }} Tax Rule</h2>
              <button class="modal-close" (click)="closeTaxModal()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M18 6L6 18M6 6l12 12"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                </svg>
              </button>
            </div>

            @if (formError()) {
              <div class="form-error">{{ formError() }}</div>
            }

            <div class="modal-body">
              <div class="form-field">
                <label class="form-label">Name *</label>
                <input
                  class="form-input"
                  [(ngModel)]="taxForm().name"
                  placeholder="e.g. Tea & Beverages GST"
                />
              </div>

              <div class="form-row">
                <div class="form-field">
                  <label class="form-label">Category (blank = global default)</label>
                  <select class="form-input" [(ngModel)]="taxForm().categoryId">
                    <option value="">Global Default</option>
                    @for (cat of categories(); track cat._id) {
                      <option [value]="cat._id">{{ cat.name }}</option>
                    }
                  </select>
                </div>
                <div class="form-field">
                  <label class="form-label">GST Rate % *</label>
                  <select class="form-input" [(ngModel)]="taxForm().rate">
                    <option [ngValue]="0">0% (Exempt)</option>
                    <option [ngValue]="5">5%</option>
                    <option [ngValue]="12">12%</option>
                    <option [ngValue]="18">18% (Standard)</option>
                    <option [ngValue]="28">28% (Luxury)</option>
                  </select>
                </div>
              </div>

              <div class="form-field">
                <label class="form-label toggle-label">
                  <input type="checkbox" [(ngModel)]="taxForm().isInclusive" />
                  Tax inclusive (MRP already includes GST — typical for Indian ecommerce)
                </label>
              </div>

              <div class="form-field">
                <label class="form-label toggle-label">
                  <input type="checkbox" [(ngModel)]="taxForm().isActive" />
                  Active
                </label>
              </div>
            </div>

            <div class="modal-footer">
              <button class="btn-cancel" (click)="closeTaxModal()">Cancel</button>
              <button class="btn-primary" (click)="saveTax()" [disabled]="saving()">
                {{ saving() ? 'Saving…' : editingTaxId() ? 'Update Rule' : 'Create Rule' }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      @use '../../../core/design-tokens/tokens' as *;
      @use '../../../core/design-tokens/mixins' as *;

      // ── Page ──────────────────────────────────────────────────────────────────
      .pricing-page {
        padding: $space-xl;
        max-width: 1040px;

        @include respond-to(md) {
          padding: $space-lg $space-md;
        }
      }

      .page-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        margin-bottom: $space-xl;
      }

      .page-title {
        font-size: $font-size-xl;
        font-weight: $font-weight-bold;
        color: $color-text-primary;
        margin: 0 0 4px;
        letter-spacing: $letter-spacing-tight;
      }

      .page-subtitle {
        font-size: $font-size-sm;
        color: $color-text-tertiary;
        margin: 0;
      }

      // ── Tabs ──────────────────────────────────────────────────────────────────
      .tabs {
        display: flex;
        gap: 3px;
        background: $color-bg-secondary;
        border: 1px solid $color-border-light;
        border-radius: $radius-lg;
        padding: 4px;
        margin-bottom: $space-xl;
        width: fit-content;
      }

      .tab {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 20px;
        border: none;
        background: none;
        border-radius: $radius-md;
        font-size: $font-size-sm;
        font-weight: $font-weight-medium;
        color: $color-text-secondary;
        cursor: pointer;
        transition: all $transition-fast;

        &.active {
          background: white;
          color: $color-text-primary;
          box-shadow: $shadow-sm;
          font-weight: $font-weight-semibold;
        }
      }

      .tab-badge {
        background: $color-primary;
        color: white;
        font-size: 10px;
        font-weight: $font-weight-bold;
        padding: 1px 7px;
        border-radius: 999px;
        min-width: 18px;
        text-align: center;
      }

      // ── Loading ───────────────────────────────────────────────────────────────
      .loading-state {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 80px $space-xl;
        color: $color-text-tertiary;
        font-size: $font-size-sm;
        gap: $space-sm;

        &::before {
          content: '';
          width: 16px;
          height: 16px;
          border: 2px solid $color-border;
          border-top-color: $color-primary;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      // ── Section ───────────────────────────────────────────────────────────────
      .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: $space-lg;
      }

      .section-count {
        font-size: $font-size-sm;
        color: $color-text-tertiary;
        font-weight: $font-weight-medium;
      }

      // ── Empty state ───────────────────────────────────────────────────────────
      .empty-state {
        padding: $space-xxl $space-xl;
        text-align: center;
        background: $color-bg-secondary;
        border-radius: $radius-xl;
        border: 1px dashed $color-border;

        .empty-icon {
          font-size: 32px;
          margin-bottom: $space-md;
          opacity: 0.5;
        }

        p {
          font-size: $font-size-sm;
          color: $color-text-tertiary;
          margin: 0;
          line-height: 1.5;
        }
      }

      // ── Rule cards ────────────────────────────────────────────────────────────
      .rules-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .rule-card {
        background: white;
        border: 1px solid $color-border-light;
        border-radius: $radius-lg;
        padding: $space-md $space-lg;
        transition:
          box-shadow $transition-fast,
          border-color $transition-fast;

        &:hover {
          box-shadow: $shadow-md;
          border-color: $color-border;
        }

        &.inactive {
          opacity: 0.5;
          background: $color-bg-secondary;
        }
      }

      .rule-card-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: $space-md;
      }

      .rule-meta {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .rule-name {
        font-size: $font-size-md;
        font-weight: $font-weight-semibold;
        color: $color-text-primary;
      }

      .rule-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .badge {
        font-size: 11px;
        font-weight: $font-weight-semibold;
        padding: 3px 9px;
        border-radius: 999px;
        line-height: 1;
      }

      .badge-type {
        background: rgba(204, 88, 3, 0.1);
        color: $color-primary;
      }
      .badge-scope {
        background: rgba(87, 136, 108, 0.1);
        color: $color-success;
      }
      .badge-active {
        background: rgba(87, 136, 108, 0.12);
        color: $color-success;
      }
      .badge-inactive {
        background: rgba(58, 45, 50, 0.08);
        color: $color-text-tertiary;
      }
      .badge-priority {
        background: $color-bg-secondary;
        color: $color-text-secondary;
        border: 1px solid $color-border-light;
      }

      .rule-actions {
        display: flex;
        gap: 6px;
        flex-shrink: 0;
      }

      .btn-icon {
        width: 34px;
        height: 34px;
        border-radius: $radius-md;
        border: 1px solid $color-border-light;
        background: white;
        color: $color-text-secondary;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all $transition-fast;
        flex-shrink: 0;

        &:hover {
          background: $color-bg-secondary;
          color: $color-text-primary;
          border-color: $color-border;
        }
      }

      .btn-icon-danger:hover {
        background: rgba(176, 0, 32, 0.06);
        color: $color-error;
        border-color: rgba(176, 0, 32, 0.25);
      }

      // ── Tier chips in card ────────────────────────────────────────────────────
      .tiers-display {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: $space-sm;
        padding-top: $space-sm;
        border-top: 1px solid $color-border-light;
      }

      .tier-chip {
        font-size: 12px;
        padding: 4px 12px;
        background: $color-bg-secondary;
        border: 1px solid $color-border-light;
        border-radius: $radius-sm;
        color: $color-text-secondary;

        strong {
          color: $color-primary;
        }
      }

      .rule-detail {
        font-size: $font-size-sm;
        color: $color-text-secondary;
        margin-top: $space-sm;
        padding-top: $space-sm;
        border-top: 1px solid $color-border-light;
      }

      // ── Buttons ───────────────────────────────────────────────────────────────
      .btn-primary {
        display: inline-flex;
        align-items: center;
        gap: $space-xs;
        background: $color-primary;
        color: white;
        border: none;
        padding: 10px $space-lg;
        border-radius: $radius-md;
        font-size: $font-size-sm;
        font-weight: $font-weight-semibold;
        cursor: pointer;
        transition: all $transition-fast;
        letter-spacing: 0.01em;

        &:hover {
          background: $color-primary-hover;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(204, 88, 3, 0.25);
        }
        &:active {
          transform: translateY(0);
        }
        &:disabled {
          opacity: 0.5;
          cursor: default;
          transform: none;
          box-shadow: none;
        }
      }

      .btn-cancel {
        padding: 10px $space-lg;
        border: 1px solid $color-border;
        background: white;
        color: $color-text-secondary;
        border-radius: $radius-md;
        font-size: $font-size-sm;
        font-weight: $font-weight-medium;
        cursor: pointer;
        transition: all $transition-fast;

        &:hover {
          background: $color-bg-secondary;
          border-color: $color-border;
          color: $color-text-primary;
        }
      }

      // ── Modal ─────────────────────────────────────────────────────────────────
      .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(10, 8, 9, 0.45);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        padding: $space-lg;
      }

      .modal {
        background: white;
        border-radius: $radius-xl;
        width: 100%;
        max-width: 620px;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow:
          0 24px 64px rgba(10, 8, 9, 0.24),
          0 4px 16px rgba(10, 8, 9, 0.08);
        animation: modal-in 0.18s ease-out;

        &::-webkit-scrollbar {
          width: 4px;
        }
        &::-webkit-scrollbar-track {
          background: transparent;
        }
        &::-webkit-scrollbar-thumb {
          background: $color-border;
          border-radius: 2px;
        }
      }

      @keyframes modal-in {
        from {
          opacity: 0;
          transform: scale(0.97) translateY(8px);
        }
        to {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }

      .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: $space-lg $space-xl;
        border-bottom: 1px solid $color-border-light;
        position: sticky;
        top: 0;
        background: white;
        z-index: 1;

        h2 {
          font-size: $font-size-lg;
          font-weight: $font-weight-bold;
          margin: 0;
          color: $color-text-primary;
        }
      }

      .modal-close {
        width: 34px;
        height: 34px;
        border-radius: $radius-md;
        border: 1px solid $color-border-light;
        background: white;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: $color-text-secondary;
        transition: all $transition-fast;

        &:hover {
          background: $color-bg-secondary;
          color: $color-text-primary;
        }
      }

      .modal-body {
        padding: $space-xl;
        display: flex;
        flex-direction: column;
        gap: $space-lg;
      }

      .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: $space-sm;
        padding: $space-md $space-xl $space-lg;
        border-top: 1px solid $color-border-light;
      }

      // ── Form error ────────────────────────────────────────────────────────────
      .form-error {
        margin: $space-md $space-xl 0;
        padding: 10px $space-md;
        background: rgba(176, 0, 32, 0.06);
        border: 1px solid rgba(176, 0, 32, 0.15);
        color: $color-error;
        border-radius: $radius-md;
        font-size: $font-size-sm;
      }

      // ── Form fields ───────────────────────────────────────────────────────────
      .form-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: $space-md;

        @include respond-to(xs) {
          grid-template-columns: 1fr;
        }
      }

      .form-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .form-label {
        font-size: 11px;
        font-weight: $font-weight-semibold;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        color: $color-text-tertiary;
      }

      .form-input {
        padding: 10px $space-md;
        border: 1.5px solid $color-border-light;
        border-radius: $radius-md;
        font-size: $font-size-sm;
        color: $color-text-primary;
        background: $color-bg-secondary;
        transition: all $transition-fast;
        font-family: inherit;

        &:focus {
          outline: none;
          border-color: $color-primary;
          background: white;
          box-shadow: 0 0 0 3px rgba(204, 88, 3, 0.08);
        }

        &::placeholder {
          color: $color-text-tertiary;
        }
      }

      select.form-input {
        cursor: pointer;
      }

      .toggle-label {
        display: flex;
        align-items: center;
        gap: $space-sm;
        cursor: pointer;
        text-transform: none;
        letter-spacing: 0;
        font-size: $font-size-sm;
        font-weight: $font-weight-medium;
        color: $color-text-primary;
        padding: 10px $space-md;
        background: $color-bg-secondary;
        border: 1.5px solid $color-border-light;
        border-radius: $radius-md;
        transition: border-color $transition-fast;

        input[type='checkbox'] {
          width: 16px;
          height: 16px;
          accent-color: $color-primary;
          cursor: pointer;
        }

        &:hover {
          border-color: $color-border;
        }
      }

      // ── Tiers editor ──────────────────────────────────────────────────────────
      .tiers-section {
        display: flex;
        flex-direction: column;
        gap: $space-sm;
        background: $color-bg-secondary;
        border: 1.5px solid $color-border-light;
        border-radius: $radius-md;
        padding: $space-md;
      }

      .tiers-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 2px;
      }

      .tiers-table-header {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr 32px;
        gap: $space-sm;
        font-size: 10px;
        font-weight: $font-weight-semibold;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        color: $color-text-tertiary;
        padding: 0 2px;
      }

      .tier-row {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr 32px;
        gap: $space-sm;
        align-items: center;
      }

      .tier-input {
        padding: 8px $space-sm !important;
        font-size: $font-size-sm !important;
        background: white !important;
      }

      .tier-hint {
        font-size: 11px;
        color: $color-text-tertiary;
        font-style: italic;
      }

      .btn-add-tier {
        font-size: $font-size-xs;
        font-weight: $font-weight-semibold;
        color: $color-primary;
        background: none;
        border: none;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: $radius-sm;
        transition: background $transition-fast;

        &:hover {
          background: rgba(204, 88, 3, 0.08);
        }
      }

      .btn-remove-tier {
        width: 28px;
        height: 28px;
        border-radius: $radius-sm;
        border: 1px solid $color-border-light;
        background: white;
        color: $color-text-tertiary;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all $transition-fast;

        &:hover:not(:disabled) {
          background: rgba(176, 0, 32, 0.06);
          color: $color-error;
          border-color: rgba(176, 0, 32, 0.3);
        }

        &:disabled {
          opacity: 0.3;
          cursor: default;
        }
      }
    `,
  ],
})
export class PricingRulesComponent implements OnInit {
  priceRules = signal<PriceRule[]>([]);
  taxRules = signal<TaxRule[]>([]);
  categories = signal<Category[]>([]);
  loading = signal(false);
  saving = signal(false);
  formError = signal<string | null>(null);

  activeTab = signal<'rules' | 'tax'>('rules');
  showRuleModal = signal(false);
  showTaxModal = signal(false);
  editingRuleId = signal<string | null>(null);
  editingTaxId = signal<string | null>(null);

  ruleForm = signal<PriceRuleForm>(emptyPriceRuleForm());
  taxForm = signal<TaxRuleForm>(emptyTaxRuleForm());

  constructor(
    private pricing: PricingService,
    private catalog: CatalogService,
  ) {}

  ngOnInit() {
    this.loadAll();
    this.catalog.getCategories({ limit: 100 }).subscribe({
      next: (res) => this.categories.set(res.data),
    });
  }

  private loadAll() {
    this.loading.set(true);
    this.pricing.getPriceRules().subscribe({
      next: (res) => {
        this.priceRules.set(res.data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.pricing.getTaxRules().subscribe({
      next: (res) => this.taxRules.set(res.data),
    });
  }

  // ─── Price Rule Modal ────────────────────────────────────────────────────────

  openCreateRule() {
    this.editingRuleId.set(null);
    this.ruleForm.set(emptyPriceRuleForm());
    this.formError.set(null);
    this.showRuleModal.set(true);
  }

  openEditRule(rule: PriceRule) {
    this.editingRuleId.set(rule._id);
    this.ruleForm.set({
      name: rule.name,
      type: rule.type,
      scope: rule.scope,
      productId: rule.productId ?? '',
      categoryId: rule.categoryId ?? '',
      collectionId: rule.collectionId ?? '',
      tiers: rule.tiers ? [...rule.tiers.map((t) => ({ ...t }))] : [],
      discountPercent: rule.discountPercent ?? null,
      fixedPrice: rule.fixedPrice ?? null,
      priority: rule.priority,
      isActive: rule.isActive,
    });
    this.formError.set(null);
    this.showRuleModal.set(true);
  }

  closeRuleModal() {
    this.showRuleModal.set(false);
  }

  addTier() {
    this.ruleForm.update((f) => ({
      ...f,
      tiers: [...f.tiers, { minQty: 1, maxQty: null, discountPercent: 0 }],
    }));
  }

  removeTier(i: number) {
    this.ruleForm.update((f) => ({ ...f, tiers: f.tiers.filter((_, idx) => idx !== i) }));
  }

  saveRule() {
    const f = this.ruleForm();
    if (!f.name.trim()) {
      this.formError.set('Name is required');
      return;
    }

    const payload: CreatePriceRulePayload = {
      name: f.name.trim(),
      type: f.type,
      scope: f.scope,
      productId: f.productId || undefined,
      categoryId: f.categoryId || undefined,
      collectionId: f.collectionId || undefined,
      tiers:
        f.type === 'quantity_tier'
          ? f.tiers.map((t) => ({ ...t, maxQty: t.maxQty || null }))
          : undefined,
      discountPercent: f.type === 'percentage' ? (f.discountPercent ?? undefined) : undefined,
      fixedPrice: f.type === 'fixed_price' ? (f.fixedPrice ?? undefined) : undefined,
      priority: f.priority,
      isActive: f.isActive,
    };

    this.saving.set(true);
    const obs = this.editingRuleId()
      ? this.pricing.updatePriceRule(this.editingRuleId()!, payload)
      : this.pricing.createPriceRule(payload);

    obs.subscribe({
      next: () => {
        this.saving.set(false);
        this.closeRuleModal();
        this.loadAll();
      },
      error: (err) => {
        this.saving.set(false);
        this.formError.set(err?.error?.message ?? 'Failed to save');
      },
    });
  }

  deleteRule(id: string) {
    if (!confirm('Delete this price rule?')) return;
    this.pricing.deletePriceRule(id).subscribe({
      next: () => this.priceRules.update((r) => r.filter((x) => x._id !== id)),
      error: (err) => alert(err?.error?.message ?? 'Failed to delete'),
    });
  }

  // ─── Tax Rule Modal ──────────────────────────────────────────────────────────

  openCreateTax() {
    this.editingTaxId.set(null);
    this.taxForm.set(emptyTaxRuleForm());
    this.formError.set(null);
    this.showTaxModal.set(true);
  }

  openEditTax(tax: TaxRule) {
    this.editingTaxId.set(tax._id);
    this.taxForm.set({
      name: tax.name,
      categoryId: tax.categoryId ?? '',
      rate: tax.rate,
      isInclusive: tax.isInclusive,
      isActive: tax.isActive,
    });
    this.formError.set(null);
    this.showTaxModal.set(true);
  }

  closeTaxModal() {
    this.showTaxModal.set(false);
  }

  saveTax() {
    const f = this.taxForm();
    if (!f.name.trim()) {
      this.formError.set('Name is required');
      return;
    }

    const payload: CreateTaxRulePayload = {
      name: f.name.trim(),
      categoryId: f.categoryId || null,
      rate: f.rate,
      isInclusive: f.isInclusive,
      isActive: f.isActive,
    };

    this.saving.set(true);
    const obs = this.editingTaxId()
      ? this.pricing.updateTaxRule(this.editingTaxId()!, payload)
      : this.pricing.createTaxRule(payload);

    obs.subscribe({
      next: () => {
        this.saving.set(false);
        this.closeTaxModal();
        this.loadAll();
      },
      error: (err) => {
        this.saving.set(false);
        this.formError.set(err?.error?.message ?? 'Failed to save');
      },
    });
  }

  deleteTax(id: string) {
    if (!confirm('Delete this tax rule?')) return;
    this.pricing.deleteTaxRule(id).subscribe({
      next: () => this.taxRules.update((r) => r.filter((x) => x._id !== id)),
      error: (err) => alert(err?.error?.message ?? 'Failed to delete'),
    });
  }
}
