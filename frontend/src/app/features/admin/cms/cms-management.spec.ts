import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { CmsManagementComponent } from './cms-management';

describe('CmsManagementComponent', () => {
  let component: CmsManagementComponent;
  let fixture: ComponentFixture<CmsManagementComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CmsManagementComponent, HttpClientTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(CmsManagementComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
