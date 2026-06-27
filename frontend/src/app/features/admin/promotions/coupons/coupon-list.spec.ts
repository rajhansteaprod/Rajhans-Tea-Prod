import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DiscountListComponent } from './coupon-list';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

describe('DiscountListComponent', () => {
  let component: DiscountListComponent;
  let fixture: ComponentFixture<DiscountListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DiscountListComponent, CommonModule, FormsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(DiscountListComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with empty discounts array', () => {
    expect(component.discounts()).toEqual([]);
  });

  it('should toggle form visibility', () => {
    expect(component.showForm()).toBeFalsy();
    component.openForm();
    expect(component.showForm()).toBeTruthy();
    component.closeForm();
    expect(component.showForm()).toBeFalsy();
  });

  it('should reset form data when opening form', () => {
    component.openForm();
    expect(component.formData().valueType).toBe('percentage');
    expect(component.formData().isActive).toBe(true);
  });

  it('should load discounts', () => {
    expect(component.isLoading()).toBeFalsy();
    component.loadDiscounts();
    expect(component.isLoading()).toBeFalsy();
  });

  it('should close form after saving discount', () => {
    component.openForm();
    component.saveDiscount();
    expect(component.showForm()).toBeFalsy();
  });

  it('should populate form when editing discount', () => {
    const testDiscount = {
      _id: '1',
      code: 'TEST20',
      title: 'Test Discount',
      type: 'promo_code' as const,
      description: 'Test discount',
      valueType: 'percentage' as const,
      value: 20,
      minOrderAmount: 100,
      maxCap: 200,
      usageLimit: 100,
      usedCount: 0,
      validFrom: new Date(),
      validUntil: new Date(),
      isActive: true,
    };

    component.editDiscount(testDiscount);
    expect(component.showForm()).toBeTruthy();
    expect(component.formData().code).toBe('TEST20');
  });

  it('should toggle discount status', () => {
    const testDiscount = {
      _id: '1',
      code: 'TEST20',
      title: 'Test Discount',
      type: 'promo_code' as const,
      description: 'Test discount',
      valueType: 'percentage' as const,
      value: 20,
      minOrderAmount: 100,
      maxCap: 200,
      usageLimit: 100,
      usedCount: 0,
      validFrom: new Date(),
      validUntil: new Date(),
      isActive: true,
    };

    component.toggleStatus(testDiscount);
    expect(testDiscount.isActive).toBeFalsy();
  });
});
