import re
import logging
from typing import List, Dict, Any, Tuple

logger = logging.getLogger(__name__)

class ContentChecker:
    """
    Checks if references and figures are cited in the text content.
    """

    @staticmethod
    def check_reference_citation(text: str, reference_order: int, authors: str = None) -> Dict[str, Any]:
        """
        Checks if a reference is cited in the text by number or author name.
        
        Args:
            text: The full text content of the PDF.
            reference_order: The reference number (e.g., 1 for [1]).
            authors: The author string (e.g., "Smith et al.").
            
        Returns:
            Dict with 'valid' (bool) and 'reason' (str).
        """
        if not text:
            return {'valid': False, 'reason': "No text content available"}

        # Check 1: Reference Number (e.g., [1], [1, 2], [1-3])
        # Patterns to match:
        # - [1]
        # - [1,
        # - , 1]
        # - , 1,
        # - [1-
        # - -1]
        # We need to be careful not to match "11" when looking for "1".
        
        # Simple strict pattern first: [1]
        if f"[{reference_order}]" in text:
             return {'valid': True, 'reason': f"Found citation [{reference_order}]"}
             
        # Regex for more complex cases like [1, 2] or [1-5]
        # Look for the number surrounded by delimiters within brackets
        # This is a bit complex to regex perfectly across the whole file without context, 
        # but we can try to find the number in typical citation contexts.
        
        # Pattern: brackets containing the number, with optional other numbers/ranges
        # \[ matches literal [
        # (?:[^\]]*[,\s-])? matches optional content before the number (non-closing-bracket chars)
        # \b{reference_order}\b matches the exact number
        # (?:[,\s-][^\]]*)? matches optional content after the number
        # \] matches literal ]
        citation_pattern = re.compile(r'\[(?:[^\]]*[,\s-])?\b' + str(reference_order) + r'\b(?:[,\s-][^\]]*)?\]')
        
        if citation_pattern.search(text):
            return {'valid': True, 'reason': f"Found citation number {reference_order} in text"}

        # Check 2: Author Name
        if authors:
            # Extract the first author's last name
            # Typical formats: "Smith et al.", "Smith, J.", "John Smith"
            # We'll try to find the first significant name part
            
            # Remove "et al."
            clean_authors = re.sub(r'\s+et\s+al\.?', '', authors, flags=re.IGNORECASE)
            
            # Split by comma to get first author group if multiple
            first_author_group = clean_authors.split(',')[0].strip()
            
            # Try to find a last name (usually the word before a comma or the last word)
            # If "Smith, J.", split by comma -> "Smith"
            # If "John Smith", split by space -> "Smith"
            
            name_parts = re.split(r'[\s,]+', first_author_group)
            potential_names = [p for p in name_parts if len(p) > 2 and p.istitle()]
            
            for name in potential_names:
                # Search for the name in text, but avoid matching the reference list itself if possible.
                # (Ideally we'd exclude the reference section, but for now we search the whole text)
                # We look for "Name et al" or "Name (Year)" or just "Name" in a sentence.
                
                # Simple check: is the name in the text more than once? 
                # (Assuming once is the reference list entry itself)
                matches = re.findall(r'\b' + re.escape(name) + r'\b', text)
                if len(matches) >= 2:
                     return {'valid': True, 'reason': f"Found author name '{name}' in text"}
            
        return {'valid': False, 'reason': "Citation number or author name not found in text"}

    @staticmethod
    def check_figure_callouts(text: str) -> Dict[str, Any]:
        """
        Checks for figure callouts in the text.
        
        Returns:
            Dict with counts and validation status.
        """
        if not text:
            return {'figures': {}, 'summary': "No text content"}
            
        # Patterns for figure callouts
        # Fig. 1, Figure 1, Fig 1, figure 1
        # We want to capture the number.
        
        pattern = re.compile(r'\b(?:fig\.?|figure)\s*(\d+)', re.IGNORECASE)
        matches = pattern.findall(text)
        
        figure_counts = {}
        for num in matches:
            num_int = int(num)
            figure_counts[num_int] = figure_counts.get(num_int, 0) + 1
            
        # Validate: "if the figure number is available at inside the text content at least 2 time"
        # We'll return the raw counts and let the caller/UI decide how to present it,
        # or we can return a list of valid/invalid figures.
        
        validation_results = {}
        for fig_num, count in figure_counts.items():
            # We assume one mention might be the caption itself, so we need at least 2 mentions 
            # to count as "cited in text" + "caption".
            # The requirement says "available at inside the text content at least 2 time".
            is_valid = count >= 2
            validation_results[fig_num] = {
                'count': count,
                'valid': is_valid,
                'reason': f"Found {count} times" if is_valid else f"Found only {count} time(s)"
            }
            
        return {
            'counts': figure_counts,
            'validation': validation_results
        }
