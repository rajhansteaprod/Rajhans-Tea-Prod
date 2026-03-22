import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { WalletPageComponent } from './wallet-page';

describe('WalletPageComponent', () => {
  let component: WalletPageComponent;
  let fixture: ComponentFixture<WalletPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WalletPageComponent, HttpClientTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(WalletPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
