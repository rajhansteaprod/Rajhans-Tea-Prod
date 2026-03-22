import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UserSessionsComponent } from './user-sessions';

describe('UserSessionsComponent', () => {
  let component: UserSessionsComponent;
  let fixture: ComponentFixture<UserSessionsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserSessionsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UserSessionsComponent);
    component = fixture.componentInstance;
    component.userId = 'test-user-id';
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
