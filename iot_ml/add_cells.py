import json

notebook_path = 'Untitled.ipynb'

with open(notebook_path, 'r', encoding='utf-8') as f:
    nb = json.load(f)

new_code = """import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report

# Define threshold for high current (e.g., based on mean or specific domain knowledge)
# From df.describe(), max current is 0.13, mean is ~0.116
threshold_value = 0.12 

# Create target variable based on threshold
df['Current_Class'] = np.where(df['Current (A)'] >= threshold_value, 'High', 'Normal')

print("Class distribution:")
print(df['Current_Class'].value_counts())

# Features and target
X = df[['Voltage Min (V)', 'Voltage Max (V)']]
y = df['Current_Class']

# Split the data
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Train a Random Forest Classifier
clf = RandomForestClassifier(random_state=42)
clf.fit(X_train, y_train)

# Predict and evaluate
y_pred = clf.predict(X_test)

print("\\nClassification Report:")
print(classification_report(y_test, y_pred))
"""

new_cell = {
    "cell_type": "code",
    "execution_count": None,
    "metadata": {},
    "outputs": [],
    "source": [line + '\\n' for line in new_code.split('\\n')][:-1] # Add newlines except for the last line
}

# The split('\n') leaves an empty element at the end if the string ends with \n, 
# so let's format it safely:
source_lines = [line + '\\n' for line in new_code.split('\\n')]
source_lines[-1] = source_lines[-1].strip() # remove the trailing newline from last line

new_cell["source"] = source_lines

nb['cells'].append(new_cell)

with open(notebook_path, 'w', encoding='utf-8') as f:
    json.dump(nb, f, indent=1)
    
print("Successfully added ML code cell to the notebook.")
