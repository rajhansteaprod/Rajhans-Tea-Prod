import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../../core/services/auth.service';
import { environment } from '../../../../environments/environment';

interface ProfileForm {
  firstName: string;
  lastName: string;
  email: string;
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.html',
  styleUrls: ['./profile.scss'],
})
export class ProfileComponent implements OnInit {
  form: ProfileForm = { firstName: '', lastName: '', email: '' };
  phone = '';
  saving = signal(false);
  message = signal('');

  constructor(
    private http: HttpClient,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    const user = this.authService.user();
    if (user) {
      this.form.firstName = user.firstName || '';
      this.form.lastName = user.lastName || '';
      this.form.email = user.email || '';
      this.phone = user.phone || '';
    }
  }

  save(): void {
    this.saving.set(true);
    this.message.set('');

    this.http
      .put<{ success: boolean; data: { user: any } }>(
        `${environment.apiUrl}/auth/profile`,
        this.form,
      )
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.message.set('Profile updated');
          this.authService.updateUser({
            firstName: this.form.firstName,
            lastName: this.form.lastName,
            email: this.form.email,
          });
        },
        error: () => {
          this.saving.set(false);
          this.message.set('Something went wrong');
        },
      });
  }
}
