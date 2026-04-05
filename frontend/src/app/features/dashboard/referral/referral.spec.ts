import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ReferralComponent } from './referral';

describe('ReferralComponent', () => {
  let component: ReferralComponent;
  let fixture: ComponentFixture<ReferralComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReferralComponent, HttpClientTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(ReferralComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
