import sys
import os
import random
import time
from typing import List

# Add project root to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from src.sales.elite_tactics import ObjectionHandler

def load_tips(manual_path: str) -> List[str]:
    """Extrait des conseils du manuel de vente."""
    tips = []
    try:
        with open(manual_path, 'r', encoding='utf-8') as f:
            content = f.read()
            # Simple extraction based on markdown bullets or key phrases
            lines = content.split('\n')
            for line in lines:
                if line.strip().startswith('*') or line.strip().startswith('-'):
                    tips.append(line.strip()[2:].strip())
    except Exception as e:
        print(f"⚠️  Impossible de lire le manuel : {e}")
        return ["Soyez détaché du résultat.", "Posez des questions avant de répondre.", "Vous êtes le prix."]
    return tips

def print_slow(text: str, delay: float = 0.01):
    """Affiche le texte caractère par caractère."""
    for char in text:
        sys.stdout.write(char)
        sys.stdout.flush()
        time.sleep(delay)
    print()

def main():
    print("==================================================")
    print("      ELITE SALES TRAINING DOJO")
    print("==================================================")
    print("Bienvenue dans le simulateur de traitement des objections.")
    print("Tapez 'quit' pour quitter.\n")

    manual_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docs", "playbooks", "ELITE_SALES_MANUAL.md")
    tips = load_tips(manual_path)
    
    objection_types = list(ObjectionHandler.OBJECTIONS.keys())
    
    while True:
        print("\n--------------------------------------------------")
        print("🤖 LE PROSPECT (Simulé) :")
        
        # Mode entrainement libre ou scénarisé ?
        # Pour l'instant libre : L'utilisateur tape l'objection qu'il veut tester
        user_input = input(">> Entrez une objection courante (ex: 'C'est trop cher') : ")
        
        if user_input.lower() in ['quit', 'exit', 'q']:
            print("\nFin de l'entraînement. Bon closing !")
            break
            
        print("\n🛡️  RÉPONSE ÉLITE :")
        response = ObjectionHandler.handle_objection(user_input)
        print_slow(response)
        
        print("\n💡 CONSEIL DU MANUEL :")
        if tips:
            print(f"   \"{random.choice(tips)}\"")
        else:
            print("   (Pas de conseil disponible)")

if __name__ == "__main__":
    main()
