import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { AdminOrderListComponent } from './order-list';

describe('AdminOrderListComponent', () => {
  let component: AdminOrderListComponent;
  let fixture: ComponentFixture<AdminOrderListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminOrderListComponent, HttpClientTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminOrderListComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
