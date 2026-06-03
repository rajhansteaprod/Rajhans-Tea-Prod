import { Component } from '@angular/core';

@Component({
  selector: 'app-contact-page',
  standalone: true,
  template: `
    <div class="contact-container">
      <h1>Contact Us</h1>
      <p>Hello World</p>
    </div>
  `,
  styles: [`
    .contact-container {
      padding: 40px 20px;
      max-width: 1200px;
      margin: 0 auto;
    }
    h1 {
      font-size: 32px;
      margin-bottom: 20px;
    }
  `]
})
export class ContactPageComponent {}
