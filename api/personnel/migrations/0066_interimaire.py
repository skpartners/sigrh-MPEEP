from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0065_roles_hierarchiques"),
    ]

    operations = [
        migrations.AddField(
            model_name="profil",
            name="interim",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="interimaires",
                to="personnel.entitetutelle",
            ),
        ),
    ]
