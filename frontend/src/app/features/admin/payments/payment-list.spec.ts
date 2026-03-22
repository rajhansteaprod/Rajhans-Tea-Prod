import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { AdminPaymentListComponent } from './payment-list';

describe('AdminPaymentListComponent', () => {
  let component: AdminPaymentListComponent;
  let fixture: ComponentFixture<AdminPaymentListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminPaymentListComponent, HttpClientTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminPaymentListComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
