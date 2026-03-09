import sys
import json
import os

# Fallback prediction to keep dashboard working even if pandas or scikit-learn is uninstalled
def fallback_predict(voltage, current):
    # Mean current ~0.116, threshold 0.12 according to user's requirements
    return "High" if current >= 0.12 else "Normal"

HAS_ML = False
classifier = None
df = None

try:
    import pandas as pd
    import numpy as np
    from sklearn.ensemble import RandomForestClassifier
    import openpyxl  # Ensure openpyxl is implicitly imported if needed
    HAS_ML = True
except ImportError:
    HAS_ML = False

excel_path = 'file_123.xlsx'

if HAS_ML:
    try:
        # Load data and train classifier on startup
        if os.path.exists(excel_path):
            df = pd.read_excel(excel_path)
            
            # Predict based on previously defined threshold
            if 'Current_Class' not in df.columns:
                df['Current_Class'] = np.where(df['Current (A)'] >= 0.12, 'High', 'Normal')
            
            X = df[['Voltage Min (V)', 'Voltage Max (V)']]
            y = df['Current_Class']
            
            classifier = RandomForestClassifier(random_state=42)
            classifier.fit(X, y)
        else:
            HAS_ML = False  # No data to train on
    except Exception as e:
        HAS_ML = False

# Inform Node.js that the bridge is ready
print("READY", flush=True)

# Loop and read incoming data
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    
    try:
        data = json.loads(line)
        voltage = float(data.get('voltage', 0))
        current = float(data.get('current', 0))
        
        # Predict High / Normal
        pred = fallback_predict(voltage, current)
        
        if HAS_ML and classifier is not None and df is not None:
            # We predict using current voltage for both Min and Max for real-time
            pred_array = classifier.predict(pd.DataFrame([[voltage, voltage]], columns=['Voltage Min (V)', 'Voltage Max (V)']))
            pred = pred_array[0]
            
            # Append new realtime row to Excel dataset
            new_row_dict = {
                'Event': 'Realtime', 
                'Voltage Min (V)': voltage, 
                'Voltage Max (V)': voltage, 
                'Current (A)': current, 
                'Remarks': pred
            }
            new_row_df = pd.DataFrame([new_row_dict])
            df = pd.concat([df, new_row_df], ignore_index=True)
            
            # Save relevant columns back to Excel after every change
            # Filter DataFrame to match original Excel columns (without Current_Class column)
            keep_cols = ['Event', 'Voltage Min (V)', 'Voltage Max (V)', 'Current (A)', 'Remarks']
            df_to_save = df[[c for c in keep_cols if c in df.columns]]
            df_to_save.to_excel(excel_path, index=False)
            
        print(json.dumps({"status": pred}), flush=True)
        
    except Exception as e:
        print(json.dumps({"error": str(e)}), flush=True)
