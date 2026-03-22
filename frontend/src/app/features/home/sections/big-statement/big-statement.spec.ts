import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BigStatementComponent } from './big-statement';

describe('BigStatementComponent', () => {
  let component: BigStatementComponent;
  let fixture: ComponentFixture<BigStatementComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BigStatementComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(BigStatementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
