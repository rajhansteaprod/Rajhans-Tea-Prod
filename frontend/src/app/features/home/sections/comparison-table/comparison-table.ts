import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

interface ComparisonFeature {
  icon: string;
  name: string;
  rajhansText: string;
  rajhansSubtext: string;
  othersText: string;
  othersSubtext: string;
}

@Component({
  selector: 'app-comparison-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './comparison-table.html',
  styleUrls: ['./comparison-table.scss'],
})
export class ComparisonTableComponent {
  features: ComparisonFeature[] = [
    {
      icon: 'cup',
      name: 'Tea Consumption',
      rajhansText: 'Uses less tea per cup',
      rajhansSubtext: '(Saves ~ Rs. 1400/year)',
      othersText: 'Needs more tea per cup',
      othersSubtext: '(costs more)',
    },
    {
      icon: 'leaf',
      name: 'Freshness & Sourcing',
      rajhansText: 'Fresh from gardens',
      rajhansSubtext: '(pure & aromatic)',
      othersText: 'Stale, months old',
      othersSubtext: '(you pay for dust)',
    },
    {
      icon: 'shield',
      name: 'Strength Retention',
      rajhansText: 'Stays strong longer',
      rajhansSubtext: '(140+ extra cups)',
      othersText: 'Loses strength quickly',
      othersSubtext: '(runs out fast)',
    },
    {
      icon: 'leaf',
      name: 'Flavors & Additives',
      rajhansText: '100% real Chai',
      rajhansSubtext: '(true value, no additives)',
      othersText: 'Artificial flavors added',
      othersSubtext: '(no real value)',
    },
  ];
}
