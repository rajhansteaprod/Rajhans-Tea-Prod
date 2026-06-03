import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ContactPageComponent } from './contact-page';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ReactiveFormsModule } from '@angular/forms';

describe('ContactPageComponent', () => {
  let component: ContactPageComponent;
  let fixture: ComponentFixture<ContactPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContactPageComponent, HttpClientTestingModule, ReactiveFormsModule]
    }).compileComponents();

    fixture = TestBed.createComponent(ContactPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize form with all fields', () => {
    expect(component.form.get('fullName')).toBeTruthy();
    expect(component.form.get('mobileNumber')).toBeTruthy();
    expect(component.form.get('emailAddress')).toBeTruthy();
    expect(component.form.get('address')).toBeTruthy();
    expect(component.form.get('reasonToContact')).toBeTruthy();
    expect(component.form.get('message')).toBeTruthy();
    expect(component.form.get('companyName')).toBeTruthy();
    expect(component.form.get('preferredDeliveryDate')).toBeTruthy();
  });

  it('should validate required fields', () => {
    expect(component.form.valid).toBeFalsy();

    component.form.patchValue({
      fullName: 'John Doe',
      mobileNumber: '9876543210',
      emailAddress: 'john@example.com',
      reasonToContact: 'help'
    });

    expect(component.form.get('reasonToContact')?.valid).toBeTruthy();
  });

  it('should validate mobile number format', () => {
    const mobileControl = component.form.get('mobileNumber');

    mobileControl?.setValue('123');
    expect(mobileControl?.hasError('pattern')).toBeTruthy();

    mobileControl?.setValue('9876543210');
    expect(mobileControl?.hasError('pattern')).toBeFalsy();
  });

  it('should validate email format', () => {
    const emailControl = component.form.get('emailAddress');

    emailControl?.setValue('invalid-email');
    expect(emailControl?.hasError('email')).toBeTruthy();

    emailControl?.setValue('valid@example.com');
    expect(emailControl?.hasError('email')).toBeFalsy();
  });

  it('should make message required for Help & Support', () => {
    component.form.patchValue({
      reasonToContact: 'help'
    });

    const messageControl = component.form.get('message');
    expect(messageControl?.hasError('required')).toBeTruthy();
  });

  it('should make message optional for Buy in Bulk', () => {
    component.form.patchValue({
      reasonToContact: 'bulk'
    });

    const messageControl = component.form.get('message');
    expect(messageControl?.valid).toBeTruthy();
  });

  it('should show corporate gifting fields only for gifting reason', () => {
    component.form.patchValue({
      reasonToContact: 'gifting'
    });

    expect(component.isFieldVisible('companyName')).toBeTruthy();
    expect(component.isFieldVisible('preferredDeliveryDate')).toBeTruthy();
  });

  it('should hide corporate gifting fields for other reasons', () => {
    component.form.patchValue({
      reasonToContact: 'help'
    });

    expect(component.isFieldVisible('companyName')).toBeFalsy();
    expect(component.isFieldVisible('preferredDeliveryDate')).toBeFalsy();
  });
});
